import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { explainError } from './pedidos.errors';
import { PedidosData, type OrderListItem } from './pedidos.data';
import {
  ALL_STATUSES,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PURPOSE_LABEL,
  PURPOSE_TONE,
  PURPOSES,
  STATUS_LABEL,
  STATUS_TONE,
  type OrderPurpose,
  type OrderStatus,
} from './pedidos.labels';

type StatusFilter = OrderStatus | 'all' | 'open';
type PurposeFilter = OrderPurpose | 'all';

const FINISHED: OrderStatus[] = ['delivered', 'closed', 'cancelled'];

@Component({
  selector: 'app-pedidos',
  imports: [RouterLink, Page, Badge, AsyncState, Empty, ...FORMAT_PIPES],
  template: `
    <pp-page title="Pedidos" subtitle="Ventas, uso personal y regalos">
      <a actions routerLink="/pedidos/nuevo"><button type="button">Nuevo pedido</button></a>

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
            <a routerLink="/pedidos/nuevo"><button type="button">Crear un pedido</button></a>
          </pp-empty>
        } @else {
          <ul class="orders">
            @for (order of visible(); track order.id) {
              <li>
                <a [routerLink]="['/pedidos', order.id]">
                  <div class="top">
                    <strong>{{ order.number }}</strong>
                    <pp-badge [tone]="purposeTone[order.purpose]">{{ purposeName(order) }}</pp-badge>
                    <pp-badge [tone]="statusTone[order.status]">{{ statusLabel[order.status] }}</pp-badge>
                    @if (order.paymentStatus !== 'not_applicable' && order.status !== 'cancelled') {
                      <pp-badge [tone]="paymentTone[order.paymentStatus]">{{ paymentLabel[order.paymentStatus] }}</pp-badge>
                    }
                  </div>
                  <div class="who">{{ subject(order) }}</div>
                  <div class="meta muted">
                    @if (order.dueDate) { Entrega {{ order.dueDate | fecha }} } @else { Sin fecha de entrega }
                    @if (order.partialDelivery; as part) {
                      · Entregado en parte: {{ part.delivered }} de {{ part.ordered }}
                    }
                  </div>
                  <div class="total num">
                    @if (order.purpose === 'sale') { {{ order.total | money }} } @else { <span class="muted">Sin precio</span> }
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
      display: grid; grid-template-columns: 1fr auto; gap: 0.15rem 1rem;
      padding: 0.8rem 1rem; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); color: inherit; text-decoration: none;
    }
    .orders a:hover, .orders a:focus-visible { border-color: var(--accent); }
    .top { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; grid-column: 1; }
    .who { grid-column: 1; }
    .meta { grid-column: 1; font-size: 0.8rem; }
    .total { grid-column: 2; grid-row: 1 / span 3; align-self: center; font-weight: 600; }
  `,
})
export class PedidosPage {
  private readonly data = inject(PedidosData);

  protected readonly statuses = ALL_STATUSES;
  protected readonly purposes = PURPOSES;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly purposeLabel = PURPOSE_LABEL;
  protected readonly purposeTone = PURPOSE_TONE;
  protected readonly paymentLabel = PAYMENT_STATUS_LABEL;
  protected readonly paymentTone = PAYMENT_STATUS_TONE;

  protected readonly orders = signal<OrderListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<StatusFilter>('open');
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
