import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field, FORMAT_PIPES } from '../../ui';
import { invalidMessage } from './form-helpers';
import { InventarioData, type SpoolSummary, type WeighingResult } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_PIPES, signedQuantity } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';
import { CurrentWorkspace } from '../../core/workspace';

const WEIGHT_PRECISION = 1000;
/** A 1 kg roll with its spool weighs about 1.2 kg: the database refuses past this, as a typo. */
const MAX_WEIGHT_G = 100_000;

/**
 * Compares what the scale says (minus the empty spool) with what the movements
 * say should be left, and explains the adjustment before it is saved.
 *
 * What it explains is a preview. What is saved is the scale and the tare: the
 * database takes the difference against what the roll has at that moment, so
 * a dialog left open while a print closed, or a second tab, leaves the roll at
 * what the scale said instead of applying the difference twice (T3-02).
 *
 * A roll marked out of use says what the weighing does to it before it is
 * saved. An emptied one with filament on the scale reopens by itself: it was a
 * mistake about how much was left. A discarded one was a decision about the
 * filament, so it comes back only if the person ticks «Vuelve a usarse», and
 * the database refuses it otherwise.
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
          <input type="number" step="0.1" min="0" formControlName="grossG" inputmode="decimal" />
        </pp-field>
        <pp-field
          label="Tara del carrete (g)"
          [required]="true"
          [hint]="spool().tareG === null ? 'Este filamento no tiene tara guardada: ingrésala aquí.' : undefined"
          [error]="msg(form.controls.tareG)"
        >
          <input type="number" step="0.1" min="0" formControlName="tareG" inputmode="decimal" />
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
          <p class="notice">El peso coincide con lo esperado. Si lo registras y nada cambió mientras tanto, no se escribe ningún ajuste.</p>
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

        @if (needsReopen()) {
          <div class="alert alert-warn">
            <p>
              Este rollo está <strong>descartado</strong>: su filamento ya salió del stock como merma. Pesarlo con
              filamento lo vuelve a usar, y sus {{ realNet() | qty: 'g' }} vuelven a contar en Filamentos y en el plan.
            </p>
            <label class="check">
              <input type="checkbox" formControlName="reopen" />
              Vuelve a usarse: el filamento sirve.
            </label>
            @if (!form.controls.reopen.value) {
              <p class="muted">Si solo querías anotar lo que se botó, no hace falta pesarlo.</p>
            }
          </div>
        } @else if (reopensByItself()) {
          <p class="notice">
            Este rollo está agotado. Como la balanza encuentra filamento, vuelve a quedar abierto y sus gramos vuelven a
            contar en Filamentos y en el plan.
          </p>
        }
      </section>

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
        <button type="submit" [disabled]="busy() || !canSave()">
          {{ busy() ? 'Guardando…' : 'Registrar pesaje' }}
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
      .alert p { margin: 0 0 0.5rem; }
      .alert .check { margin: 0; }
      .alert .muted { margin: 0.5rem 0 0; }
    `,
  ],
})
export class WeighForm {
  private readonly data = inject(InventarioData);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly spool = input.required<SpoolSummary>();
  readonly saved = output<WeighingResult>();
  readonly cancelled = output<void>();
  /**
   * Refused, or no answer: the roll may have changed since the dialog opened
   * (discarded or emptied in another tab). The screen that owns the list
   * reloads it and hands the fresh roll back, so what the dialog asks for, like
   * «Vuelve a usarse», matches the roll the database judged.
   */
  readonly refused = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly msg = invalidMessage;

  protected readonly form = this.fb.group({
    grossG: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(MAX_WEIGHT_G)]),
    tareG: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(MAX_WEIGHT_G)]),
    reopen: new FormControl(false, { nonNullable: true }),
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

  /** Filament on the scale of a discarded roll: it comes back only if the person says so. */
  protected readonly needsReopen = computed(() => this.spool().status === 'discarded' && (this.realNet() ?? 0) > 0);

  /** Filament on the scale of an emptied roll: the database reopens it, and the dialog says so first. */
  protected readonly reopensByItself = computed(() => this.spool().status === 'empty' && (this.realNet() ?? 0) > 0);

  /**
   * Any valid weighing can be saved, a matching one too: what matters is what
   * the roll has when it is saved, not when the dialog opened.
   */
  protected readonly canSave = computed(
    () => this.difference() !== null && (!this.needsReopen() || this.values().reopen === true),
  );

  ngOnInit(): void {
    this.form.controls.tareG.setValue(this.spool().tareG);
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    const { grossG, tareG } = this.form.getRawValue();
    if (this.form.invalid || grossG === null || tareG === null || !this.canSave()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.data.recordWeighing({
        spoolId: this.spool().id,
        grossG,
        tareG,
        reopen: this.needsReopen() && this.form.controls.reopen.value,
      });
      this.saved.emit(result);
    } catch (error) {
      void this.workspace.afterRefusal(error);
      this.error.set(describeError(error, 'No pudimos registrar el pesaje. Inténtalo de nuevo.'));
      this.refused.emit();
    } finally {
      this.busy.set(false);
    }
  }

  private round(value: number): number {
    return Math.round(value * WEIGHT_PRECISION) / WEIGHT_PRECISION;
  }
}
