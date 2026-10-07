import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  buyText,
  forOrdersText,
  holdText,
  withoutHoldsText,
  readyLine,
  readyPhrase,
  saleSituation,
} from './promise-text';
import type { LinePromise } from './sale-promise';

/**
 * "¿Para cuándo?" under a line being sold: the day and hour to tell the
 * customer, what there is and what has to be made, whose hold keeps what is
 * on the shelf, and what has to be bought first.
 *
 * It informs and never blocks (decision of the owner): the seller knows
 * whether the sweets can be bought in time, the plan does not.
 */
@Component({
  selector: 'app-promesa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="promesa" [class.stale]="stale()" role="status" aria-live="polite">
      <p class="when">
        @if (heading()) { <span class="label">{{ heading() }}</span> }
        <strong>{{ ready() }}</strong>
      </p>
      @if (risk(); as text) { <p class="muted">Si falla una placa: {{ text }}.</p> }
      <p class="situation">{{ forWhom() }}: {{ situation() }}</p>
      @for (hold of promise().holds; track hold.number) {
        <p class="held">{{ held(hold) }}</p>
      }
      @if (withoutHolds(); as text) {
        <p class="held">{{ text }}</p>
      }
      @if (promise().forOrders.length > 0) {
        <p class="muted">{{ ordersText() }}</p>
      }
      @if (buy(); as text) {
        <p class="buy">{{ text }} <span>La fecha supone que llega a tiempo.</span></p>
      } @else if (promise().plan.quantity > 0) {
        <p class="enough">El material alcanza.</p>
      }
    </div>
  `,
  styles: `
    .promesa {
      display: grid; gap: 0.3rem; padding: 0.65rem 0.8rem;
      border: 1px solid var(--line); border-left: 3px solid var(--info); border-radius: var(--radius-sm);
      background: var(--surface); font-size: var(--fs-sm); transition: opacity 0.15s;
    }
    .promesa.stale { opacity: 0.6; }
    p { margin: 0; }
    .when { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.45rem; font-size: var(--fs-md); }
    .label { color: var(--muted); font-size: var(--fs-sm); }
    .held { padding: 0.35rem 0.55rem; border-radius: var(--radius-sm); background: var(--info-soft); color: var(--info); }
    .buy { padding: 0.35rem 0.55rem; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn); }
    .buy span { opacity: 0.85; }
    .enough { color: var(--good); }
  `,
})
export class Promesa {
  readonly promise = input.required<LinePromise>();
  /** The moment the plan was computed for: "hoy" and "mañana" are said from it. */
  readonly now = input.required<string>();
  /** Empty where the card around it already asks the question. */
  readonly heading = input('¿Para cuándo?');
  /** Who the line is for, before what there is: "Para esta venta", "Para esta línea". */
  readonly forWhom = input('Para esta venta');
  /** A newer answer is on its way. */
  readonly stale = input(false);

  protected readonly ready = computed(() => readyLine(this.promise().plan.readyAt, this.now()));
  protected readonly risk = computed(() => {
    const { readyAt, readyAtIfFailure } = this.promise().plan;
    return readyAtIfFailure === readyAt ? null : readyPhrase(readyAtIfFailure, this.now());
  });
  protected readonly situation = computed(() => saleSituation(this.promise().plan, this.promise().madeToOrder));
  protected readonly ordersText = computed(() => forOrdersText(this.promise().forOrders));
  protected readonly buy = computed(() => buyText(this.promise().plan));
  protected readonly withoutHolds = computed(() => withoutHoldsText(this.promise(), this.now()));
  protected readonly held = holdText;
}
