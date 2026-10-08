import { Component, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { Badge, Card, Empty, FORMAT_PIPES } from '../../ui';
import { PAYMENT_STATUS_LABEL, STATUS_LABEL } from '../pedidos/pedidos.labels';
import {
  OportunidadesData,
  type LinkCandidate,
  type LinkedOrder,
  type LinkedQuote,
  type OpportunityCard,
  type StageChange,
} from './oportunidades.data';
import { closedBlockers, STAGE_LABEL, STAGE_TONE } from './oportunidades.models';

const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
};

/** Un trato completo: sus cotizaciones, sus pedidos y por dónde ha pasado. */
@Component({
  selector: 'app-oportunidad-detalle',
  imports: [RouterLink, Card, Badge, Empty, ...FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    `
      dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 0 0 1rem; }
      dt { color: var(--muted); font-size: 0.85rem; }
      dd { margin: 0; font-size: 0.9rem; }
      .link-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: end; margin-top: 0.75rem; }
      .link-row select { flex: 1; min-width: 12rem; }
      .trail { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
      .trail li { font-size: 0.85rem; }
      .trail .when { color: var(--muted); }
      .trail .why { display: block; color: var(--muted); font-style: italic; }
    `,
  ],
  template: `
    <pp-card [heading]="opportunity().title">
      <div class="toolbar">
        <pp-badge [tone]="tones[opportunity().stage]">{{ labels[opportunity().stage] }}</pp-badge>
        @if (opportunity().blockedReason; as reason) {
          <pp-badge tone="warn">Esperando: {{ reason }}</pp-badge>
        }
        <span class="grow"></span>
        <button type="button" class="secondary" (click)="edit.emit()">Editar</button>
        <button type="button" class="ghost" (click)="closed.emit()">Cerrar ficha</button>
      </div>

      <dl>
        <dt>Cliente</dt>
        <dd>{{ opportunity().customerName ?? '—' }}</dd>
        <dt>Lo lleva</dt>
        <dd>{{ opportunity().ownerName ?? 'Sin asignar' }}</dd>
        <dt>Se decide</dt>
        <dd>{{ opportunity().expectedClose ? (opportunity().expectedClose | fecha) : '—' }}</dd>
        <dt>Cotizado</dt>
        <dd>{{ opportunity().quotedTotal | money }}</dd>
        <dt>Pedido</dt>
        <dd>{{ opportunity().orderedTotal | money }}</dd>
        @if (opportunity().note; as note) {
          <dt>Nota</dt>
          <dd>{{ note }}</dd>
        }
      </dl>

      @if (blockers(); as message) {
        <p class="notice">Para llegar a «Cerrado»: {{ message }}</p>
      } @else if (opportunity().stage !== 'closed') {
        <p class="notice">Todo entregado y cobrado: el trato pasa solo a «Cerrado».</p>
      }

      @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }

      <h3>Cotizaciones</h3>
      @if (quotes().length === 0) {
        <pp-empty message="Este trato todavía no tiene cotizaciones." />
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Número</th><th>Estado</th><th>Emitida</th><th class="num">Total</th><th></th></tr>
            </thead>
            <tbody>
              @for (quote of quotes(); track quote.id) {
                <tr>
                  <td><a [routerLink]="['/cotizaciones', quote.id]">{{ quote.number }}</a></td>
                  <td>{{ quoteStatus(quote.status) }}</td>
                  <td>{{ quote.issuedOn | fecha }}</td>
                  <td class="num">{{ quote.total | money }}</td>
                  <td class="num">
                    <button type="button" class="ghost" (click)="unlinkQuote(quote)">Quitar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <div class="link-row">
        <label class="grow">
          <span class="muted">Enganchar una cotización suelta</span>
          <select [value]="pickedQuote()" (change)="pickedQuote.set($any($event.target).value)">
            <option value="">Elige una cotización</option>
            @for (option of freeQuotes(); track option.id) {
              <option [value]="option.id">
                {{ option.number }} · {{ option.customerName ?? 'sin cliente' }} · {{ option.total | money }}
              </option>
            }
          </select>
        </label>
        <button type="button" class="secondary" [disabled]="!pickedQuote() || busy()" (click)="attachQuote()">
          Enganchar
        </button>
      </div>

      <h3>Pedidos</h3>
      @if (orders().length === 0) {
        <pp-empty message="Este trato todavía no se convirtió en pedido." />
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Número</th><th>Estado</th><th>Cobro</th><th>Entrega</th><th class="num">Total</th><th></th></tr>
            </thead>
            <tbody>
              @for (order of orders(); track order.id) {
                <tr>
                  <td><a [routerLink]="['/pedidos', order.id]">{{ order.number }}</a></td>
                  <td>{{ orderStatus(order.status) }}</td>
                  <td>{{ paymentStatus(order.paymentStatus) }}</td>
                  <td>{{ order.dueDate ? (order.dueDate | fecha) : '—' }}</td>
                  <td class="num">{{ order.total | money }}</td>
                  <td class="num">
                    <button type="button" class="ghost" (click)="unlinkOrder(order)">Quitar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <div class="link-row">
        <label class="grow">
          <span class="muted">Enganchar un pedido suelto</span>
          <select [value]="pickedOrder()" (change)="pickedOrder.set($any($event.target).value)">
            <option value="">Elige un pedido</option>
            @for (option of freeOrders(); track option.id) {
              <option [value]="option.id">
                {{ option.number }} · {{ option.customerName ?? 'sin cliente' }} · {{ option.total | money }}
              </option>
            }
          </select>
        </label>
        <button type="button" class="secondary" [disabled]="!pickedOrder() || busy()" (click)="attachOrder()">
          Enganchar
        </button>
      </div>

      <h3>Por dónde ha pasado</h3>
      @if (history().length === 0) {
        <pp-empty message="Sin movimientos todavía." />
      } @else {
        <ul class="trail">
          @for (change of history(); track change.changedAt.getTime()) {
            <li>
              @if (change.fromStage) {
                {{ labels[change.fromStage] }} → <strong>{{ labels[change.toStage] }}</strong>
              } @else {
                Se creó en <strong>{{ labels[change.toStage] }}</strong>
              }
              <span class="when">· {{ change.changedAt | fecha }} · {{ change.changedByName ?? 'el sistema' }}</span>
              @if (change.note; as note) { <span class="why">«{{ note }}»</span> }
            </li>
          }
        </ul>
      }
    </pp-card>
  `,
})
export class OportunidadDetalle {
  private readonly data = inject(OportunidadesData);

  readonly opportunity = input.required<OpportunityCard>();
  /** Algo cambió y el tablero tiene que volver a leerse. */
  readonly changed = output<void>();
  readonly edit = output<void>();
  readonly closed = output<void>();

  protected readonly labels = STAGE_LABEL;
  protected readonly tones = STAGE_TONE;

  protected readonly quotes = signal<LinkedQuote[]>([]);
  protected readonly orders = signal<LinkedOrder[]>([]);
  protected readonly history = signal<StageChange[]>([]);
  protected readonly freeQuotes = signal<LinkCandidate[]>([]);
  protected readonly freeOrders = signal<LinkCandidate[]>([]);
  protected readonly pickedQuote = signal('');
  protected readonly pickedOrder = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.load(this.opportunity().id);
    });
  }

  protected blockers(): string | null {
    const card = this.opportunity();
    return closedBlockers({
      orders: card.orders,
      openOrders: card.openOrders,
      owingOrders: card.owingOrders,
    });
  }

  protected quoteStatus(status: string): string {
    return QUOTE_STATUS_LABEL[status] ?? status;
  }

  protected orderStatus(status: string): string {
    return STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status;
  }

  protected paymentStatus(status: string): string {
    return PAYMENT_STATUS_LABEL[status as keyof typeof PAYMENT_STATUS_LABEL] ?? status;
  }

  protected async attachQuote(): Promise<void> {
    await this.run(() => this.data.linkQuote(this.pickedQuote(), this.opportunity().id));
    this.pickedQuote.set('');
  }

  protected async attachOrder(): Promise<void> {
    await this.run(() => this.data.linkOrder(this.pickedOrder(), this.opportunity().id));
    this.pickedOrder.set('');
  }

  protected async unlinkQuote(quote: LinkedQuote): Promise<void> {
    await this.run(() => this.data.linkQuote(quote.id, null));
  }

  protected async unlinkOrder(order: LinkedOrder): Promise<void> {
    await this.run(() => this.data.linkOrder(order.id, null));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    // A second click arrives before the buttons are drawn disabled.
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.load(this.opportunity().id);
      // La etapa puede haber cambiado sola: enganchar un pedido gana el trato.
      this.changed.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cambiar lo que cuelga de este trato.'));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    try {
      const [quotes, orders, history, freeQuotes, freeOrders] = await Promise.all([
        this.data.quotesOf(id),
        this.data.ordersOf(id),
        this.data.history(id),
        this.data.freeQuotes(),
        this.data.freeOrders(),
      ]);
      this.quotes.set(quotes);
      this.orders.set(orders);
      this.history.set(history);
      this.freeQuotes.set(freeQuotes);
      this.freeOrders.set(freeOrders);
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos leer este trato.'));
    }
  }
}
