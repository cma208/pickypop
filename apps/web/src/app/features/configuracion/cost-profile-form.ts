import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import type { CostProfileRecord, Valuation } from './configuracion.models';
import { VALUATION_HELP, VALUATION_LABELS, VALUATIONS } from './configuracion.models';
import { ConfiguracionData } from './configuracion.data';
import { errorOf, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { todayLocal } from '../../core/dates';
import { date as formatDate } from '../../core/format';

const PERCENT_SCALE = 100;
const MAX_PERCENT = 99.99;
const RATE_DECIMALS = 10_000;

const toPercent = (fraction: number): number => Math.round(fraction * PERCENT_SCALE * 100) / 100;
const toFraction = (percent: number): number => Math.round((percent / PERCENT_SCALE) * RATE_DECIMALS) / RATE_DECIMALS;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** numeric(12, 2): what the money columns hold. Beyond it the database answers with an overflow. */
const MAX_MONEY = 9_999_999_999.99;
/** numeric(12, 4), the electricity rate. */
const MAX_RATE = 99_999_999.9999;

const PERCENT_VALIDATORS = [Validators.required, Validators.min(0), Validators.max(MAX_PERCENT)];
const MONEY_VALIDATORS = [Validators.required, Validators.min(0), Validators.max(MAX_MONEY)];
const RATE_VALIDATORS = [Validators.required, Validators.min(0), Validators.max(MAX_RATE)];
const PERCENT_CONTROLS = new Set(['materialWastePct', 'failurePct', 'marginPct', 'igvPct']);

/**
 * A new version of the cost profile, or the correction of one that has not
 * started yet. The profile in force is never edited.
 */
@Component({
  selector: 'app-cost-profile-form',
  imports: [ReactiveFormsModule, Field],
  styles: SECTION_STYLES,
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>{{ heading() }}</h3>
      @if (editing()) {
        <p class="muted">
          Esta versión todavía no rige, así que nada se calculó con ella: lo que corrijas aquí es lo que regirá desde su
          fecha.
        </p>
      } @else if (base()) {
        <p class="muted">
          Parte de los valores vigentes. Cambia lo que haga falta: se guarda como una versión nueva y la
          actual queda en el historial.
        </p>
      } @else {
        <p class="muted">
          Todavía no hay parámetros vigentes, así que estos son valores de partida. Cámbialos por los de tu taller:
          lo que guardes será la primera versión, y las cotizaciones la usan desde la fecha que elijas.
        </p>
      }

      <pp-field label="Vigente desde" [required]="true" [error]="err('validFrom')" hint="No puede ser anterior a hoy. Debe ser una fecha que ninguna otra versión use.">
        <input type="date" formControlName="validFrom" [min]="today" />
      </pp-field>

      <div class="grid two">
        <pp-field label="Merma de material (%)" [required]="true" [error]="err('materialWastePct')" hint="Cebado y restos del rollo.">
          <input type="number" step="0.01" min="0" formControlName="materialWastePct" inputmode="decimal" />
        </pp-field>
        <pp-field label="Tasa de fallo (%)" [required]="true" [error]="err('failurePct')" hint="Parte de lo impreso que se pierde en fallas, medida en costo y no en cantidad de impresiones. Resultados te dice cada mes si alcanzó.">
          <input type="number" step="0.01" min="0" formControlName="failurePct" inputmode="decimal" />
        </pp-field>
        <pp-field label="Hora de trabajo (S/)" [required]="true" [error]="err('laborRate')">
          <input type="number" step="0.01" min="0" formControlName="laborRate" inputmode="decimal" />
        </pp-field>
        <pp-field label="Tarifa eléctrica (S/ por kWh)" [required]="true" [error]="err('energyRate')" hint="Tómala de tu recibo de luz.">
          <input type="number" step="0.0001" min="0" formControlName="energyRate" inputmode="decimal" />
        </pp-field>
        <pp-field label="Margen objetivo (%)" [required]="true" [error]="err('marginPct')" hint="Sobre el precio, no sobre el costo.">
          <input type="number" step="0.01" min="0" formControlName="marginPct" inputmode="decimal" />
        </pp-field>
        <pp-field label="Precio mínimo por pedido (S/)" [required]="true" [error]="err('minPrice')" hint="0 si no hay mínimo.">
          <input type="number" step="0.01" min="0" formControlName="minPrice" inputmode="decimal" />
        </pp-field>
        <pp-field label="Redondeo (S/)" [required]="true" [error]="err('roundingStep')" hint="El precio sube al siguiente múltiplo. 0 para no redondear.">
          <input type="number" step="0.01" min="0" formControlName="roundingStep" inputmode="decimal" />
        </pp-field>
        <pp-field label="IGV (%)" [required]="true" [error]="err('igvPct')" hint="Solo se desglosa en RER, RMT y General.">
          <input type="number" step="0.01" min="0" formControlName="igvPct" inputmode="decimal" />
        </pp-field>
      </div>

      <pp-field label="Valorización del material" [required]="true" [hint]="valuationHelp[form.controls.valuation.value]">
        <select formControlName="valuation">
          @for (option of valuations; track option) {
            <option [value]="option">{{ valuationLabels[option] }}</option>
          }
        </select>
      </pp-field>

      <pp-field label="Motivo del cambio" hint="Opcional. Ayuda a entender el historial.">
        <textarea rows="2" formControlName="note"></textarea>
      </pp-field>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : submitLabel() }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class CostProfileForm {
  private readonly data = inject(ConfiguracionData);

  /** The profile in force, used as the starting point; the one being corrected when there is one. */
  readonly base = input.required<CostProfileRecord | null>();
  /** A scheduled version being corrected; null for a new one. */
  readonly editing = input<CostProfileRecord | null>(null);
  /** Dates already taken by another version. */
  readonly takenDates = input<string[]>([]);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly today = todayLocal();
  protected readonly valuations = VALUATIONS;
  protected readonly valuationLabels = VALUATION_LABELS;
  protected readonly valuationHelp = VALUATION_HELP;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    validFrom: new FormControl(this.today, { nonNullable: true, validators: [Validators.required] }),
    materialWastePct: new FormControl<number | null>(3, PERCENT_VALIDATORS),
    failurePct: new FormControl<number | null>(10, PERCENT_VALIDATORS),
    laborRate: new FormControl<number | null>(0, MONEY_VALIDATORS),
    energyRate: new FormControl<number | null>(0, RATE_VALIDATORS),
    marginPct: new FormControl<number | null>(50, PERCENT_VALIDATORS),
    minPrice: new FormControl<number | null>(0, MONEY_VALIDATORS),
    roundingStep: new FormControl<number | null>(0.5, MONEY_VALIDATORS),
    igvPct: new FormControl<number | null>(18, PERCENT_VALIDATORS),
    valuation: new FormControl<Valuation>('weighted_avg', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
  });

  protected heading(): string {
    const editing = this.editing();
    if (editing) return `Corregir la versión programada del ${formatDate(editing.validFrom)}`;
    return this.base() ? 'Nueva versión de los parámetros' : 'Primeros parámetros de costo';
  }

  protected submitLabel(): string {
    if (this.editing()) return 'Guardar la corrección';
    return this.base() ? 'Guardar nueva versión' : 'Guardar los parámetros';
  }

  ngOnInit(): void {
    const taken = new Set(this.takenDates());
    let date = this.editing()?.validFrom ?? this.today;
    while (taken.has(date)) date = addDays(date, 1);

    const base = this.base();
    this.form.patchValue({ validFrom: date, note: this.editing()?.note ?? '' });
    if (!base) return;

    this.form.patchValue({
      materialWastePct: toPercent(base.materialWasteRate),
      failurePct: toPercent(base.failureRate),
      laborRate: base.laborRatePerHour,
      energyRate: base.energyRatePerKwh,
      marginPct: toPercent(base.targetMargin),
      minPrice: base.minOrderPrice,
      roundingStep: base.roundingStep,
      igvPct: toPercent(base.igvRate),
      valuation: base.materialValuation,
    });
  }

  protected err(name: keyof typeof this.form.controls): string | null {
    const control = this.form.controls[name];
    const base = name === 'validFrom' ? this.dateError(control.value as string) : null;

    return (
      errorOf(control, {
        required: 'Completa este valor.',
        min: name === 'validFrom' ? 'Elige una fecha válida.' : 'No puede ser negativo.',
        max: this.maxMessage(name),
      }) ?? base
    );
  }

  private maxMessage(name: string): string {
    if (PERCENT_CONTROLS.has(name)) return 'Debe ser menor que 100 %.';
    if (name === 'energyRate') return 'No puede pasar de S/ 99,999,999.9999 por kWh.';
    return 'No puede pasar de S/ 9,999,999,999.99.';
  }

  private dateError(value: string): string | null {
    if (value && value < this.today) return 'La fecha no puede ser anterior a hoy.';
    if (value && this.takenDates().includes(value)) return 'Ya hay una versión con esa fecha. Elige otra.';
    return null;
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const dateProblem = this.dateError(this.form.controls.validFrom.value);
    if (this.form.invalid || dateProblem) {
      if (dateProblem) this.error.set(dateProblem);
      return;
    }

    const value = this.form.getRawValue();
    const editing = this.editing();
    this.saving.set(true);
    this.error.set(null);

    try {
      const draft = {
        validFrom: value.validFrom,
        materialWasteRate: toFraction(value.materialWastePct ?? 0),
        failureRate: toFraction(value.failurePct ?? 0),
        laborRatePerHour: value.laborRate ?? 0,
        energyRatePerKwh: value.energyRate ?? 0,
        targetMargin: toFraction(value.marginPct ?? 0),
        minOrderPrice: value.minPrice ?? 0,
        roundingStep: value.roundingStep ?? 0,
        igvRate: toFraction(value.igvPct ?? 0),
        materialValuation: value.valuation,
        note: textOrNull(value.note),
      };
      if (editing) await this.data.updateCostProfile(editing.id, draft);
      else await this.data.createCostProfile(draft);
      this.saved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, editing ? 'No pudimos guardar la corrección.' : 'No pudimos guardar la nueva versión.'));
    } finally {
      this.saving.set(false);
    }
  }
}
