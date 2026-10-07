import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { friendlyError } from '../../core/friendly-error';
import { Badge, Item } from '../../ui';
import { cancelNotice, cancelQuestion, type QueuedPrint } from './order-prints';
import { PedidosData } from './pedidos.data';
import { cancelBlocker } from './pedidos.labels';

/**
 * Asking before cancelling an order. What it put in the print queue is
 * listed and the person decides (owner's decision, E4-01): the planned
 * prints go with the order, without time or cost, or stay in the queue as
 * loose jobs. One already on the printer is the database's to refuse, and
 * its words are shown as they come.
 */
@Component({
  selector: 'app-pedido-cancelar',
  imports: [RouterLink, Badge, Item],
  template: `
    @if (blocker(); as reason) {
      <div class="box warn" role="alert">
        <p>{{ reason }}</p>
        <div class="row">
          <a class="button secondary" routerLink="/finanzas/movimientos">Ir a Caja</a>
          <button type="button" class="ghost" (click)="back.emit()">Entendido</button>
        </div>
      </div>
    } @else {
      <div class="box" role="group" aria-label="Cancelar el pedido">
        @if (prints().length > 0) {
          <p>Este pedido puso esto en la cola de impresión:</p>
          <ul class="prints">
            @for (print of prints(); track print.id) {
              <li>
                <pp-item
                  [name]="print.name"
                  [path]="print.plateThumbnailPath"
                  [photo]="{ kind: 'job', id: print.id }"
                  [sub]="print.time"
                >
                  <span sub>{{ print.rolls }}</span>
                  @if (print.printing) { <pp-badge end tone="info">Imprimiendo</pp-badge> }
                </pp-item>
              </li>
            }
          </ul>
        }

        @if (planned() > 0) {
          <p>{{ question() }}</p>
          <div class="row">
            <button type="button" class="danger" (click)="cancel(true)" [disabled]="busy()">Cancelar el pedido y sus impresiones</button>
            <button type="button" class="secondary" (click)="cancel(false)" [disabled]="busy()">Cancelar solo el pedido</button>
            <button type="button" class="ghost" (click)="back.emit()" [disabled]="busy()">No cancelar</button>
          </div>
        } @else {
          <p>¿Cancelar este pedido? No se puede deshacer.</p>
          <div class="row">
            <button type="button" class="danger" (click)="cancel(true)" [disabled]="busy()">Sí, cancelar pedido</button>
            <button type="button" class="ghost" (click)="back.emit()" [disabled]="busy()">No</button>
          </div>
        }

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
          @if (printing()) { <a class="button secondary" routerLink="/produccion">Ir a la cola de impresión</a> }
        }
      </div>
    }
  `,
  styles: `
    .box { margin-top: 0.75rem; padding: 0.7rem 0.8rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
    .box.warn { border-color: var(--warn); background: var(--warn-soft); }
    .box p { margin: 0 0 0.5rem; }
    .prints { list-style: none; margin: 0 0 0.75rem; padding: 0; display: grid; gap: 0.5rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .error { margin: 0.5rem 0; }
  `,
})
export class PedidoCancelar {
  private readonly orders = inject(PedidosData);

  readonly orderId = input.required<string>();
  /** Collected and not voided; null when the order is not a sale. */
  readonly paid = input<number | null>(null);
  readonly prints = input<QueuedPrint[]>([]);

  /** The order is cancelled; carries what to tell about its prints, if anything. */
  readonly cancelled = output<string | null>();
  /** The person changed their mind. */
  readonly back = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly blocker = computed(() => cancelBlocker(this.paid()));
  protected readonly planned = computed(() => this.prints().filter((print) => !print.printing).length);
  protected readonly printing = computed(() => this.prints().some((print) => print.printing));
  protected readonly question = computed(() => cancelQuestion(this.planned()));

  protected async cancel(cancelPrints: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.orders.cancelOrder(this.orderId(), cancelPrints);
      this.cancelled.emit(cancelNotice(this.planned(), cancelPrints));
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cancelar el pedido. Inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }
}
