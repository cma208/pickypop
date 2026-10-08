import { Component, computed, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { todayLocal } from '../../core/dates';
import { errorOf, textOrNull } from '../../core/form-errors';
import { RouterLink } from '@angular/router';
import { PlanService } from '../../core/plan';
import { Card, Field, FORMAT_PIPES, Item } from '../../ui';
import { PedidoEntregas } from './pedido-entregas';
import { PedidosData, type OrderDelivery, type OrderLine } from './pedidos.data';
import {
  deliverableToday,
  deliverButtonLabel,
  deliveredAtFor,
  deliveryConfirmation,
  deliveryPayload,
  notAfterToday,
  quantityProblem,
  readyByLine,
  unitsLeaving,
  waitingPrints,
  type DeliveryQuantity,
} from './pedidos.delivery';
import { explainError } from './pedidos.errors';

/** The plan is still being read: nothing is proposed yet. */
const ASKING = undefined;

/**
 * Hands the order over: what goes out today, filled with what the plan says
 * is ready for this order, and below it what already went out. Whether there
 * is enough on the shelf is still the database's call; its answer is shown as
 * it comes. Nothing leaves before a second «Sí»: a delivery cannot be undone.
 */
@Component({
  selector: 'app-pedido-entrega',
  imports: [ReactiveFormsModule, RouterLink, Card, Field, Item, PedidoEntregas, ...FORMAT_PIPES],
  template: `
    <pp-card heading="Entrega">
      @if (notice(); as message) { <p class="notice" role="status">{{ message }}</p> }
      @if (pendingLines().length === 0) {
        @if (cancelled()) {
          <p class="muted">El pedido está cancelado: no se entrega nada más.</p>
        } @else {
          <p class="all-out">Todo entregado.</p>
        }
      }
      @if (owed(); as amount) {
        <div class="owed" role="status">
          <span>Falta cobrar <strong>{{ amount | money }}</strong>.</span>
          <button type="button" (click)="collect.emit()">Cobrar saldo</button>
        </div>
      }

      @if (pendingLines().length > 0) {
        <form [formGroup]="form" (ngSubmit)="ask()" novalidate>
          <p class="muted lead">{{ lead() }}</p>
          <div class="scroll">
            <table>
              <thead>
                <tr><th>Producto</th><th class="num">Entregar hoy</th></tr>
              </thead>
              <tbody>
                @for (line of pendingLines(); track line.id; let i = $index) {
                  <tr>
                    <td>
                      <pp-item
                        size="lead"
                        kind="product"
                        [path]="line.imagePath"
                        [photo]="{ kind: 'variant', id: line.variantId }"
                        [name]="line.description"
                        [sub]="lineText(line)"
                      />
                      @if (beyondReady(line, i); as warning) { <small class="warn-text">{{ warning }}</small> }
                      @if (waiting(line, i); as warning) {
                        <small class="error-text" role="status">
                          {{ warning }} <a routerLink="/produccion">Ir a Producción</a>
                        </small>
                      }
                    </td>
                    <td class="num">
                      <input
                        class="qty"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        step="1"
                        [max]="line.pending"
                        [formControl]="quantityAt(i)"
                        [class.invalid]="problemAt(i) !== null"
                        [attr.aria-invalid]="problemAt(i) !== null"
                        [attr.aria-label]="'Cuántas de ' + line.description + ' se entregan hoy'"
                      />
                      @if (problemAt(i); as problem) { <small class="error-text">{{ problem }}</small> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="grid two details">
            <pp-field label="Entregado el" [required]="true" hint="Hoy, salvo que anotes una entrega de otro día." [error]="dayError()">
              <input type="date" formControlName="day" [max]="today" />
            </pp-field>
            <pp-field label="Nota" hint="Opcional. Quién lo recogió, dónde se entregó…">
              <input type="text" formControlName="note" autocomplete="off" />
            </pp-field>
          </div>

          @if (confirming()) {
            <div class="confirm" role="alert">
              <p>{{ confirmation() }}</p>
              <div class="actions">
                <button type="button" (click)="submit()" [disabled]="saving()">{{ saving() ? 'Entregando…' : 'Sí, entregar' }}</button>
                <button type="button" class="secondary" (click)="confirming.set(false)" [disabled]="saving()">Volver</button>
              </div>
            </div>
          } @else {
            <div class="actions">
              <button #submitButton type="submit" [disabled]="leaving() === 0 || blocked()">{{ buttonLabel() }}</button>
              @if (ready() !== null && !matchesReady()) {
                <button type="button" class="ghost" (click)="fillReady()">Volver a lo que hay listo</button>
              }
            </div>
          }
          @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
        </form>
      }

      @if (deliveries().length > 0) {
        <app-pedido-entregas [deliveries]="deliveries()" [lines]="lines()" />
      }
    </pp-card>
  `,
  styles: `
    :host { display: block; scroll-margin-top: 1rem; }
    .lead { margin: 0 0 0.75rem; font-size: 0.85rem; }
    .scroll { overflow-x: auto; }
    .qty { width: 5.5rem; text-align: right; }
    .details { margin-top: 1rem; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .error { margin: 0.6rem 0 0; }
    .warn-text { display: block; margin-top: 0.25rem; font-size: 0.8rem; color: var(--warn); }
    .error-text { display: block; margin-top: 0.25rem; font-size: 0.8rem; color: var(--danger); text-align: left; }
    .qty.invalid { border-color: var(--danger); }
    .confirm { padding: 0.8rem; border: 1px solid var(--warn); border-radius: var(--radius); background: var(--warn-soft); }
    .confirm p { margin: 0 0 0.6rem; }
    .notice { margin: 0 0 0.75rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); background: var(--good-soft); color: var(--good); font-size: 0.85rem; }
    .owed {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;
      margin: 0 0 1rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm);
      background: var(--warn-soft); color: var(--warn); font-size: 0.9rem;
    }
    .all-out { margin: 0 0 1rem; font-weight: 600; color: var(--good); }
    app-pedido-entregas { margin-top: 1.25rem; }
  `,
})
export class PedidoEntrega {
  private readonly data = inject(PedidosData);
  private readonly planner = inject(PlanService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly orderId = input.required<string>();
  readonly lines = input.required<OrderLine[]>();
  readonly deliveries = input<OrderDelivery[]>([]);
  readonly cancelled = input(false);
  /** What is still owed on a sale; null when the order is not a sale. */
  readonly balance = input<number | null>(null);
  /** Something left the shelf; the page reloads the order. */
  readonly delivered = output<void>();
  /** The person wants to collect what is owed, in the existing collection card. */
  readonly collect = output<void>();
  /** The database refused: the page reads the order again. */
  readonly stale = output<void>();

  protected readonly today = todayLocal();
  protected readonly saving = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** Ready to hand over, by line, as the plan says. Undefined while it is read; null when it cannot say. */
  protected readonly ready = signal<ReadonlyMap<string, number> | null | undefined>(ASKING);

  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');

  protected readonly form = new FormGroup({
    quantities: new FormArray<FormControl<number | null>>([]),
    day: new FormControl(todayLocal(), { nonNullable: true, validators: [Validators.required, notAfterToday] }),
    note: new FormControl('', { nonNullable: true }),
  });

  private readonly entered = signal<(number | null)[]>([]);

  protected readonly pendingLines = computed(() => this.lines().filter((line) => line.pending > 0));

  private readonly rows = computed<(DeliveryQuantity & { kind: OrderLine['kind']; printed?: boolean })[]>(() =>
    this.pendingLines().map((line, index) => ({
      orderLineId: line.id,
      pending: line.pending,
      quantity: this.entered()[index] ?? null,
      kind: line.kind,
      printed: line.kind === 'custom' ? line.prints.printed > 0 : undefined,
    })),
  );

  /**
   * Something typed that cannot go out: more than pending, a fraction, or the
   * last of a made-to-order line whose print is still in the queue. The
   * button waits for it to be fixed instead of asking «¿Entregar?» first.
   */
  protected readonly blocked = computed(() =>
    this.pendingLines().some((line, index) => this.problemAt(index) !== null || this.waiting(line, index) !== null),
  );

  /** Where the form starts, and where «Volver a lo que hay listo» takes it back. */
  private readonly proposed = computed(() => deliverableToday(this.pendingLines(), this.ready() ?? null));

  protected readonly leaving = computed(() => unitsLeaving(this.rows()));
  protected readonly buttonLabel = computed(() =>
    this.pendingLines().some((_, index) => this.problemAt(index) !== null)
      ? 'Revisa las cantidades'
      : deliverButtonLabel(this.rows()),
  );
  protected readonly confirmation = computed(() => deliveryConfirmation(this.rows()));
  protected readonly matchesReady = computed(() =>
    this.proposed().every((quantity, index) => (this.entered()[index] ?? 0) === quantity),
  );

  /** What the form was filled with, said before anyone reads the numbers. */
  protected readonly lead = computed(() => {
    const ready = this.ready();
    if (ready === ASKING) return 'Viendo qué hay listo en el estante para este pedido…';
    if (ready === null) return 'No pudimos saber qué hay listo para este pedido: escribe cuántas salen hoy.';

    const proposed = this.proposed().reduce((total, quantity) => total + quantity, 0);
    const pending = this.pendingLines().reduce((total, line) => total + line.pending, 0);
    if (proposed === 0) return 'Todavía no hay nada listo para este pedido. Si igual se lleva algo, escribe cuántas.';
    if (proposed === pending) return 'Ya está lleno con todo lo que falta: está listo. Si hoy se lleva solo una parte, cambia las cantidades.';
    return `Ya está lleno con lo que hay listo: ${proposed} de ${pending}. Lo demás todavía no está en el estante.`;
  });

  /** Offered once something went out, so the next step after handing over is collecting. */
  protected readonly owed = computed(() => {
    const balance = this.balance();
    const somethingOut = this.deliveries().length > 0 || this.notice() !== null;
    return balance !== null && balance > 0 && somethingOut && !this.cancelled() ? balance : null;
  });

  constructor() {
    this.form.controls.quantities.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((values) => {
        this.entered.set(values);
        this.confirming.set(false);
      });

    // The plan of the whole workshop says what is on the shelf for this order.
    effect(() => {
      const id = this.orderId();
      this.planner.version();
      untracked(() => void this.loadReady(id));
    });

    // A reload after a delivery, or the plan arriving, starts the form over.
    effect(() => {
      const proposed = this.proposed();
      untracked(() => this.fill(proposed));
    });
  }

  /** Brings the form into view, ready to deliver. */
  focus(): void {
    this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.submitButton()?.nativeElement.focus({ preventScroll: true });
  }

  /**
   * Bound by instance, not by index: after a delivery the array is refilled
   * with new controls while the rows stay on screen, and a `formControlName`
   * would keep writing to the old, detached ones.
   */
  protected quantityAt(index: number): FormControl<number | null> {
    return this.form.controls.quantities.at(index);
  }

  protected lineText(line: OrderLine): string {
    const missing = line.pending === 1 ? 'falta 1' : `faltan ${line.pending}`;
    const ready = this.ready();
    const listed = ready ? ` · listas hoy: ${Math.min(line.pending, ready.get(line.id) ?? 0)}` : '';
    return `Entregado: ${line.delivered} de ${line.quantity} · ${missing}${listed}`;
  }

  /** A soft warning: more than the plan says is ready. The database has the last word. */
  protected beyondReady(line: OrderLine, index: number): string | null {
    const ready = this.ready();
    const quantity = this.entered()[index] ?? 0;
    if (!ready || line.kind !== 'catalog') return null;
    const available = ready.get(line.id) ?? 0;
    return quantity > available ? `Según el plan hay ${available} listas para este pedido.` : null;
  }

  /** What is wrong with the quantity typed for a line, or null. */
  protected problemAt(index: number): string | null {
    const line = this.pendingLines()[index];
    return line ? quantityProblem(this.entered()[index] ?? null, line.pending) : null;
  }

  /** The last of a made-to-order line, with its print still in the queue. */
  protected waiting(line: OrderLine, index: number): string | null {
    return waitingPrints(line, this.entered()[index] ?? null);
  }

  protected dayError(): string | null {
    return errorOf(this.form.controls.day, {
      required: 'Indica qué día se entregó.',
      future: 'La entrega no puede tener fecha futura: anótala con el día en que salió.',
    });
  }

  protected fillReady(): void {
    this.fill(this.proposed());
  }

  /** First step: check the form and say what is about to leave. */
  protected ask(): void {
    this.form.markAllAsTouched();
    this.error.set(null);
    this.notice.set(null);
    if (this.form.controls.day.invalid || this.blocked() || deliveryPayload(this.rows()).length === 0) return;
    this.confirming.set(true);
  }

  protected async submit(): Promise<void> {
    // First: a second click arrives before the button is drawn disabled.
    if (this.saving()) return;
    const rows = this.rows();
    const lines = deliveryPayload(rows);
    if (this.form.controls.day.invalid || this.blocked() || lines.length === 0) return;

    const { day, note } = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.data.deliver({
        orderId: this.orderId(),
        lines,
        deliveredAt: deliveredAtFor(day, todayLocal()),
        note: textOrNull(note),
      });
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos registrar la entrega. Inténtalo de nuevo.'));
      this.confirming.set(false);
      // What is pending, on the shelf or in the queue may have changed elsewhere.
      this.stale.emit();
      return;
    } finally {
      this.saving.set(false);
    }

    const units = unitsLeaving(rows);
    this.confirming.set(false);
    this.notice.set(units === 1 ? 'Entrega registrada: salió 1 unidad.' : `Entrega registrada: salieron ${units} unidades.`);
    this.form.patchValue({ day: todayLocal(), note: '' });
    this.form.markAsUntouched();
    this.delivered.emit();
  }

  private async loadReady(orderId: string): Promise<void> {
    try {
      const { result } = await this.planner.current();
      this.ready.set(readyByLine(result, orderId));
    } catch {
      this.ready.set(null);
    }
  }

  private fill(quantities: number[]): void {
    const controls = this.form.controls.quantities;
    controls.clear({ emitEvent: false });
    for (const quantity of quantities) {
      controls.push(new FormControl<number | null>(quantity), { emitEvent: false });
    }
    this.entered.set(controls.getRawValue());
    this.confirming.set(false);
  }
}
