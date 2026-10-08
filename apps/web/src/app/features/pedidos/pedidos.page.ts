import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page, Thumb } from '../../ui';
import { explainError } from './pedidos.errors';
import { PedidosData, type OrderListItem } from './pedidos.data';
import {
  ALL_STATUSES,
  PAYMENT_STATUS_LABEL,
  PURPOSE_LABEL,
  PURPOSES,
  STATUS_LABEL,
  STATUS_TONE,
  statusFilterFromLink,
  type OrderPurpose,
  type OrderStatus,
  type StatusFilter,
} from './pedidos.labels';

type PurposeFilter = OrderPurpose | 'all';

const FINISHED: OrderStatus[] = ['delivered', 'closed', 'cancelled'];

@Component({
  selector: 'app-pedidos',
  imports: [RouterLink, Page, Badge, AsyncState, Empty, Thumb, ...FORMAT_PIPES],
  template: `
    <pp-page title="Pedidos" subtitle="Ventas, uso personal y regalos">
      <a actions class="button secondary" routerLink="/pedidos/venta-rapida">Venta rápida</a>
      <a actions class="button" routerLink="/pedidos/nuevo">+ Nuevo pedido</a>

      <div class="filters">
        <label>
          <span class="muted">Estado</span>
          <select [value]="status()" (change)="status.set(readStatus($event))">
            <option value="open">En curso</option>
            <option value="all">Todos</option>
            @for (option of statuses; track option) {
              <option [value]="option">{{ statusLabel[option] }}</option>
            }
          </select>
        </label>
        <label>
          <span class="muted">Propósito</span>
          <select [value]="purpose()" (change)="purpose.set(readPurpose($event))">
            <option value="all">Todos</option>
            @for (option of purposes; track option) {
              <option [value]="option">{{ purposeLabel[option] }}</option>
            }
          </select>
        </label>
      </div>

      <pp-async [loading]="loading()" [error]="error()">
        @if (visible().length === 0) {
          <pp-empty [message]="emptyMessage()">
            <a class="button" routerLink="/pedidos/nuevo">Crear un pedido</a>
          </pp-empty>
        } @else {
          <ul class="orders">
            @for (order of visible(); track order.id) {
              <li>
                <a [routerLink]="['/pedidos', order.id]">
                  <pp-thumb size="row" [photo]="{ kind: 'order', id: order.id }" />
                  <div class="body">
                    <div class="top">
                      <strong class="who">{{ subject(order) }}</strong>
                      <pp-badge [tone]="statusTone[order.status]">{{ statusLabel[order.status] }}</pp-badge>
                    </div>
                    <div class="meta muted">
                      {{ order.number }} · {{ purposeName(order) }} ·
                      @if (order.dueDate) { entrega {{ order.dueDate | fecha }} } @else { sin fecha de entrega }
                      @if (order.partialDelivery; as part) {
                        · entregado en parte: {{ part.delivered }} de {{ part.ordered }}
                      }
                    </div>
                  </div>
                  <div class="total num">
                    @if (order.purpose === 'sale') {
                      {{ order.total | money }}
                      <!-- A sale of S/ 0 has nothing to collect: «Sin cobrar» would read as owed (T4-16). -->
                      @if (order.paymentStatus !== 'not_applicable' && order.status !== 'cancelled' && order.total > 0) {
                        <small class="pay" [class.owed]="order.paymentStatus !== 'paid'">{{ paymentLabel[order.paymentStatus] }}</small>
                      }
                    } @else {
                      <span class="muted">Sin precio</span>
                    }
                  </div>
                </a>
              </li>
            }
          </ul>
        }
      </pp-async>
    </pp-page>
  `,
  styles: `
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
    .filters label { display: grid; gap: 0.2rem; min-width: 10rem; flex: 1; max-width: 16rem; font-size: 0.8rem; }
    .orders { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
    .orders a {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.2rem 0.9rem;
      padding: 0.7rem 1rem 0.7rem 0.7rem; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); color: inherit; text-decoration: none;
    }
    .orders a:hover, .orders a:focus-visible { border-color: var(--accent); }
    .body { display: grid; gap: 0.15rem; min-width: 0; }
    .top { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; }
    .meta { font-size: var(--fs-sm); }
    .total { display: grid; justify-items: end; font-weight: 600; }
    .pay { font-size: var(--fs-xs); font-weight: 400; color: var(--muted); }
    .pay.owed { color: var(--warn); }
  `,
})
export class PedidosPage {
  private readonly data = inject(PedidosData);

  protected readonly statuses = ALL_STATUSES;
  protected readonly purposes = PURPOSES;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly purposeLabel = PURPOSE_LABEL;
  protected readonly paymentLabel = PAYMENT_STATUS_LABEL;

  protected readonly orders = signal<OrderListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<StatusFilter>(
    statusFilterFromLink(inject(ActivatedRoute).snapshot.queryParamMap.get('estado')),
  );
  protected readonly purpose = signal<PurposeFilter>('all');

  protected readonly visible = computed(() =>
    this.orders().filter((order) => this.matchesStatus(order) && this.matchesPurpose(order)),
  );

  protected readonly emptyMessage = computed(() =>
    this.orders().length === 0
      ? 'Todavía no hay pedidos.'
      : 'Ningún pedido coincide con estos filtros.',
  );

  constructor() {
    void this.load();
  }

  protected readStatus(event: Event): StatusFilter {
    return (event.target as HTMLSelectElement).value as StatusFilter;
  }

  protected readPurpose(event: Event): PurposeFilter {
    return (event.target as HTMLSelectElement).value as PurposeFilter;
  }

  protected purposeName(order: OrderListItem): string {
    const base = PURPOSE_LABEL[order.purpose];
    return order.purpose === 'gift' && order.giftCategoryName
      ? `${base} · ${order.giftCategoryName}`
      : base;
  }

  protected subject(order: OrderListItem): string {
    if (order.purpose === 'sale') return order.customerName ?? 'Sin cliente';
    if (order.recipient) return `Para ${order.recipient}`;
    return order.purpose === 'personal' ? 'Para el taller' : 'Sin destinatario';
  }

  private matchesStatus(order: OrderListItem): boolean {
    const filter = this.status();
    if (filter === 'all') return true;
    if (filter === 'open') return !FINISHED.includes(order.status);
    return order.status === filter;
  }

  private matchesPurpose(order: OrderListItem): boolean {
    return this.purpose() === 'all' || order.purpose === this.purpose();
  }

  private async load(): Promise<void> {
    try {
      this.orders.set(await this.data.listOrders());
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos leer los pedidos. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
