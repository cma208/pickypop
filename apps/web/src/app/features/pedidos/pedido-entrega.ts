import { Component, computed, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { todayLocal } from '../../core/dates';
import { errorOf, textOrNull } from '../../core/form-errors';
import { Card, Field, FORMAT_PIPES, Item } from '../../ui';
import { PedidoEntregas } from './pedido-entregas';
import { PedidosData, type OrderDelivery, type OrderLine } from './pedidos.data';
import {
  deliverButtonLabel,
  deliveredAtFor,
  deliversEverything,
  deliveryPayload,
  unitsLeaving,
  type DeliveryQuantity,
} from './pedidos.delivery';
import { explainError } from './pedidos.errors';

/**
 * Hands the order over: what goes out today, already filled with everything
 * that is missing, and below it what already went out. Whether there is enough
 * on the shelf is the database's call; its answer is shown as it comes.
 */
@Component({
  selector: 'app-pedido-entrega',
  imports: [ReactiveFormsModule, Card, Field, Item, PedidoEntregas, ...FORMAT_PIPES],
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
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <p class="muted lead">
            Ya está lleno con todo lo que falta. Si hoy se lleva solo una parte, cambia las cantidades: con 0, esa línea no sale hoy.
          </p>
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
                        [name]="line.description"
                        [sub]="'Entregado: ' + line.delivered + ' de ' + line.quantity + ' · ' + (line.pending === 1 ? 'falta 1' : 'faltan ' + line.pending)"
                      />
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
                        [attr.aria-label]="'Cuántas de ' + line.description + ' se entregan hoy'"
                      />
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

          <div class="actions">
            <button #submitButton type="submit" [disabled]="saving() || leaving() === 0">
              {{ saving() ? 'Entregando…' : buttonLabel() }}
            </button>
            @if (!everything()) {
              <button type="button" class="ghost" (click)="fillAll()">Volver a poner todo lo que falta</button>
            }
          </div>
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

  protected readonly today = todayLocal();
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');

  protected readonly form = new FormGroup({
    quantities: new FormArray<FormControl<number | null>>([]),
    day: new FormControl(todayLocal(), { nonNullable: true, validators: [Validators.required] }),
    note: new FormControl('', { nonNullable: true }),
  });

  private readonly entered = signal<(number | null)[]>([]);

  protected readonly pendingLines = computed(() => this.lines().filter((line) => line.pending > 0));

  private readonly rows = computed<DeliveryQuantity[]>(() =>
    this.pendingLines().map((line, index) => ({
      orderLineId: line.id,
      pending: line.pending,
      quantity: this.entered()[index] ?? null,
    })),
  );

  protected readonly leaving = computed(() => unitsLeaving(this.rows()));
  protected readonly everything = computed(() => deliversEverything(this.rows()));
  protected readonly buttonLabel = computed(() => deliverButtonLabel(this.rows()));

  /** Offered once something went out, so the next step after handing over is collecting. */
  protected readonly owed = computed(() => {
    const balance = this.balance();
    const somethingOut = this.deliveries().length > 0 || this.notice() !== null;
    return balance !== null && balance > 0 && somethingOut && !this.cancelled() ? balance : null;
  });

  constructor() {
    this.form.controls.quantities.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((values) => this.entered.set(values));

    // A reload after a delivery brings what is still pending: the form starts
    // over from there.
    effect(() => {
      const lines = this.pendingLines();
      untracked(() => this.fill(lines));
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

  protected dayError(): string | null {
    return errorOf(this.form.controls.day, { required: 'Indica qué día se entregó.' });
  }

  protected fillAll(): void {
    this.fill(this.pendingLines());
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.error.set(null);
    this.notice.set(null);
    const rows = this.rows();
    const lines = deliveryPayload(rows);
    if (this.form.controls.day.invalid || lines.length === 0) return;

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
      return;
    } finally {
      this.saving.set(false);
    }

    const units = unitsLeaving(rows);
    this.notice.set(units === 1 ? 'Entrega registrada: salió 1 unidad.' : `Entrega registrada: salieron ${units} unidades.`);
    this.form.patchValue({ day: todayLocal(), note: '' });
    this.form.markAsUntouched();
    this.delivered.emit();
  }

  private fill(lines: OrderLine[]): void {
    const quantities = this.form.controls.quantities;
    quantities.clear({ emitEvent: false });
    for (const line of lines) {
      quantities.push(new FormControl<number | null>(line.pending), { emitEvent: false });
    }
    this.entered.set(quantities.getRawValue());
  }
}
