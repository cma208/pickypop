import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field, FORMAT_PIPES } from '../../ui';
import { invalidMessage } from './form-helpers';
import { InventarioData, type SpoolSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_PIPES, signedQuantity } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';

const WEIGHT_PRECISION = 1000;

/**
 * Compares what the scale says (minus the empty spool) with what the movements
 * say should be left, and explains the adjustment before it is saved.
 */
@Component({
  selector: 'app-weigh-form',
  imports: [ReactiveFormsModule, Field, FORMAT_PIPES, INVENTORY_PIPES],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <p class="muted">
        Pon el rollo en la balanza con su carrete. Restamos la tara y comparamos con lo que el sistema cree que queda.
      </p>

      <div class="form-grid">
        <pp-field label="Peso en la balanza (g)" [required]="true" [error]="msg(form.controls.grossG)">
          <input type="number" step="0.1" formControlName="grossG" inputmode="decimal" />
        </pp-field>
        <pp-field
          label="Tara del carrete (g)"
          [required]="true"
          [hint]="spool().tareG === null ? 'Este filamento no tiene tara guardada: ingrésala aquí.' : undefined"
          [error]="msg(form.controls.tareG)"
        >
          <input type="number" step="0.1" formControlName="tareG" inputmode="decimal" />
        </pp-field>
      </div>

      <section class="summary" aria-live="polite">
        <dl>
          <div><dt>Esperado según movimientos</dt><dd>{{ spool().remainingG | qty: 'g' }}</dd></div>
          @if (realNet() !== null) {
            <div><dt>Filamento real (balanza − tara)</dt><dd>{{ realNet() | qty: 'g' }}</dd></div>
          }
        </dl>

        @if (invalidWeights()) {
          <p class="alert">El peso de la balanza no puede ser menor que la tara del carrete.</p>
        } @else if (difference() === null) {
          <p class="muted">Ingresa el peso para ver la diferencia.</p>
        } @else if (difference() === 0) {
          <p class="notice">El peso coincide con lo esperado. No hay nada que ajustar.</p>
        } @else {
          <p [class]="difference()! < 0 ? 'alert alert-warn' : 'notice'">
            @if (difference()! < 0) {
              Al rollo le queda <strong>menos</strong> de lo esperado.
            } @else {
              Al rollo le queda <strong>más</strong> de lo esperado.
            }
            Se registrará un movimiento de ajuste de <strong>{{ differenceText() }}</strong>
            y el rollo pasará a tener {{ realNet() | qty: 'g' }}.
          </p>
        }
      </section>

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
        <button type="submit" [disabled]="busy() || !canSave()">
          {{ busy() ? 'Guardando…' : 'Registrar ajuste' }}
        </button>
      </div>
    </form>
  `,
  styles: [
    INVENTORY_STYLES,
    `
      .summary { margin-top: 0.5rem; }
      dl { margin: 0 0 0.75rem; display: grid; gap: 0.25rem; }
      dl div { display: flex; justify-content: space-between; gap: 1rem; }
      dt { color: var(--muted); }
      dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
    `,
  ],
})
export class WeighForm {
  private readonly data = inject(InventarioData);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly spool = input.required<SpoolSummary>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly msg = invalidMessage;

  protected readonly form = this.fb.group({
    grossG: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    tareG: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly realNet = computed(() => {
    const { grossG, tareG } = this.values();
    if (grossG == null || tareG == null) return null;
    return this.round(grossG - tareG);
  });

  protected readonly invalidWeights = computed(() => {
    const net = this.realNet();
    return net !== null && net < 0;
  });

  protected readonly difference = computed(() => {
    const net = this.realNet();
    if (net === null || net < 0) return null;
    return this.round(net - this.spool().remainingG);
  });

  protected readonly differenceText = computed(() => signedQuantity(this.difference() ?? 0, 'g'));

  protected readonly canSave = computed(() => {
    const difference = this.difference();
    return difference !== null && difference !== 0;
  });

  ngOnInit(): void {
    this.form.controls.tareG.setValue(this.spool().tareG);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const { grossG, tareG } = this.form.getRawValue();
    const difference = this.difference();
    if (this.form.invalid || grossG === null || tareG === null || !difference || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.recordWeighing({
        spoolId: this.spool().id,
        differenceG: difference,
        grossG,
        tareG,
        theoreticalG: this.spool().remainingG,
        costPerGram: this.spool().costPerGram,
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos registrar el pesaje. Inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }

  private round(value: number): number {
    return Math.round(value * WEIGHT_PRECISION) / WEIGHT_PRECISION;
  }
}
