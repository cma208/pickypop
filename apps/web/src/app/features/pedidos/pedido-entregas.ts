import { Component, computed, input } from '@angular/core';
import { FORMAT_PIPES, Thumb } from '../../ui';
import type { OrderDelivery, OrderLine } from './pedidos.data';

interface DeliveredItem {
  orderLineId: string;
  quantity: number;
  description: string;
  imagePath: string | null;
}

interface DeliveryEntry {
  id: string;
  deliveredAt: Date;
  note: string | null;
  units: number;
  items: DeliveredItem[];
}

/** What already left the workshop for this order, one entry per delivery. */
@Component({
  selector: 'app-pedido-entregas',
  imports: [Thumb, ...FORMAT_PIPES],
  template: `
    <h3>Entregas registradas</h3>
    <ol class="history">
      @for (entry of entries(); track entry.id) {
        <li>
          <div class="when">
            <strong>{{ entry.deliveredAt | fecha }}</strong>
            <span class="muted">{{ entry.units === 1 ? '1 unidad' : entry.units + ' unidades' }}</span>
          </div>
          <ul class="items">
            @for (item of entry.items; track item.orderLineId) {
              <li>
                <pp-thumb size="sm" [path]="item.imagePath" [name]="item.description" />
                <span><strong>{{ item.quantity }}</strong> × {{ item.description }}</span>
              </li>
            }
          </ul>
          @if (entry.note) { <p class="note">{{ entry.note }}</p> }
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: block; }
    h3 { margin: 0 0 0.6rem; font-size: 0.9rem; }
    .history { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
    .history > li { padding: 0.6rem 0.8rem; border: 1px solid var(--line); border-radius: var(--radius-sm); }
    .when { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; margin-bottom: 0.4rem; font-size: 0.85rem; }
    .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
    .items li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
    .note { margin: 0.4rem 0 0; font-size: 0.82rem; color: var(--muted); white-space: pre-line; }
  `,
})
export class PedidoEntregas {
  readonly deliveries = input.required<OrderDelivery[]>();
  /** The order's lines, to name and picture what went out. */
  readonly lines = input.required<OrderLine[]>();

  protected readonly entries = computed<DeliveryEntry[]>(() => {
    const lines = new Map(this.lines().map((line) => [line.id, line]));
    return this.deliveries().map((delivery) => ({
      id: delivery.id,
      deliveredAt: delivery.deliveredAt,
      note: delivery.note,
      units: delivery.lines.reduce((total, line) => total + line.quantity, 0),
      // In the order's own line order, which is how the person reads it above.
      items: [...delivery.lines]
        .sort((a, b) => (lines.get(a.orderLineId)?.position ?? 0) - (lines.get(b.orderLineId)?.position ?? 0))
        .map((line) => ({
          orderLineId: line.orderLineId,
          quantity: line.quantity,
          description: lines.get(line.orderLineId)?.description ?? 'Línea del pedido',
          imagePath: lines.get(line.orderLineId)?.imagePath ?? null,
        })),
    }));
  });
}
