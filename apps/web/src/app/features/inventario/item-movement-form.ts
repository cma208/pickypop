import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { blankToNull, invalidMessage } from './form-helpers';
import { InventarioData, type InventoryItemSummary, type ItemMovementResult } from './inventario.data';
import { describeError } from './inventario.errors';
import { countedWhole, MOVEMENT_TYPE_LABELS, quantity, signedQuantity, type MovementType } from './inventario.format';
import { PURCHASE_LIMITS } from '../../core/pricing';
import { INVENTORY_STYLES } from './inventario.styles';

type Mode = 'in' | 'out' | 'count';
type OutReason = Extract<MovementType, 'consumption' | 'waste'>;

const MODE_LABELS: Record<Mode, string> = {
  in: 'Entrada (sumar existencias)',
  out: 'Salida (restar existencias)',
  count: 'Ajuste por conteo físico',
};

const QUANTITY_PRECISION = 1000;

/**
 * Manual stock movement for a supply or spare part. Always shows what will be
 * recorded and what the stock will be afterwards.
 *
 * That is a preview, from what there was when the dialog opened. What is saved
 * is what the person did (entered, took out, counted), and the database works
 * out the movement against what there is then: a count from an old tab still
 * leaves the shelf at what was counted.
 */
@Component({
  selector: 'app-item-movement-form',
  imports: [ReactiveFormsModule, Field],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <p class="muted">
        Existencias actuales de <strong>{{ item().name }}</strong>: {{ onHandText() }}
      </p>

      <pp-field label="Qué quieres registrar" [required]="true">
        <select formControlName="mode">
          @for (entry of modes; track entry.value) {
            <option [value]="entry.value">{{ entry.label }}</option>
          }
        </select>
      </pp-field>

      @if (values().mode === 'out') {
        <pp-field label="Motivo de la salida">
          <select formControlName="reason">
            <option value="consumption">Uso o consumo</option>
            <option value="waste">Merma o pérdida</option>
          </select>
        </pp-field>
      }

      <pp-field
        [label]="values().mode === 'count' ? 'Cantidad contada (' + item().unit + ')' : 'Cantidad (' + item().unit + ')'"
        [required]="true"
        [hint]="values().mode === 'count' ? 'Lo que realmente hay en el estante ahora' : undefined"
        [error]="msg(form.controls.amount)"
      >
        <input type="number" step="any" formControlName="amount" inputmode="decimal" />
      </pp-field>

      <pp-field label="Nota" hint="Por qué se hace este movimiento">
        <input formControlName="note" autocomplete="off" />
      </pp-field>

      <section aria-live="polite">
        @if (amountProblem(); as text) {
          <p class="alert alert-warn">{{ text }}</p>
        } @else if (problem(); as text) {
          <p class="alert alert-warn">{{ text }}</p>
        } @else if (signed() !== null) {
          <p class="notice">
            Se registrará <strong>{{ signedText() }}</strong> como {{ typeLabel() }}.
            Las existencias pasarán de {{ onHandText() }} a <strong>{{ afterText() }}</strong>.
          </p>
        }
      </section>

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
        <button type="submit" [disabled]="busy() || signed() === null || !!problem() || !!amountProblem()">
          {{ busy() ? 'Guardando…' : 'Registrar movimiento' }}
        </button>
      </div>
    </form>
  `,
  styles: [INVENTORY_STYLES],
})
export class ItemMovementForm {
  private readonly data = inject(InventarioData);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly item = input.required<InventoryItemSummary>();
  /** What the movement did, said for the screen that owns the list. */
  readonly saved = output<string>();
  readonly cancelled = output<void>();

  protected readonly modes = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({
    value,
    label: MODE_LABELS[value],
  }));
  protected readonly msg = invalidMessage;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    mode: ['in' as Mode],
    reason: ['consumption' as OutReason],
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    note: [''],
  });

  protected readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** The movement quantity with its sign, or null while the form is incomplete or changes nothing. */
  protected readonly signed = computed(() => {
    const { mode, amount } = this.values();
    if (amount == null || amount < 0 || mode === undefined) return null;

    const onHand = this.item().onHand;
    const value = mode === 'in' ? amount : mode === 'out' ? -amount : amount - onHand;
    const rounded = Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION;
    return rounded === 0 ? null : rounded;
  });

  protected readonly problem = computed(() => {
    const { mode, amount } = this.values();
    if (amount == null) return null;
    if (amount === 0 && mode !== 'count') return 'La cantidad debe ser mayor que cero.';
    if (mode === 'out' && amount > this.item().onHand) {
      return `No puedes sacar más de lo que hay (${this.onHandText()}).`;
    }
    if (mode === 'count' && this.signed() === null) return 'El conteo coincide con las existencias: no hay nada que ajustar.';
    return null;
  });

  /** Units are counted whole, and past a million it is a typo: the database refuses both too. */
  protected readonly amountProblem = computed(() => {
    const { amount } = this.values();
    if (amount == null) return null;
    if (amount > PURCHASE_LIMITS.quantityPerLine) return 'Hasta 1 000 000: revisa la cantidad.';
    if (countedWhole(this.item().unit) && !Number.isInteger(amount)) {
      return `${this.item().name} se cuenta por ${this.item().unit}: la cantidad va entera.`;
    }
    return null;
  });

  protected readonly onHandText = computed(() => quantity(this.item().onHand, this.item().unit));
  protected readonly signedText = computed(() => signedQuantity(this.signed() ?? 0, this.item().unit));
  protected readonly afterText = computed(() =>
    quantity(this.item().onHand + (this.signed() ?? 0), this.item().unit),
  );
  protected readonly typeLabel = computed(() => MOVEMENT_TYPE_LABELS[this.movementType()].toLowerCase());

  /** From what the database did, not from the preview: a count that matched by then wrote nothing. */
  private resultText(result: ItemMovementResult): string {
    const unit = this.item().unit;
    if (result.difference === 0) {
      return `El conteo coincide con lo que hay (${quantity(result.after, unit)}): no se registró ningún movimiento.`;
    }
    return `Movimiento registrado: ${signedQuantity(result.difference, unit)}. Ahora hay ${quantity(result.after, unit)}. Lo ves en el kardex.`;
  }

  private movementType(): MovementType {
    const { mode, reason } = this.values();
    return mode === 'out' && reason ? reason : 'adjustment';
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    const { mode, reason, amount, note } = this.form.getRawValue();
    if (this.signed() === null || this.problem() || this.amountProblem() || amount === null) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.data.recordItemMovement({
        itemId: this.item().id,
        mode,
        quantity: amount,
        reason: mode === 'out' ? reason : null,
        note: blankToNull(note),
      });
      this.saved.emit(this.resultText(result));
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos registrar el movimiento. Inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }
}
