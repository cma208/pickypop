import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs';
import { Field, FORMAT_PIPES } from '../../ui';
import { errorOf, maxDecimals, requiredText, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';
import { ImpresorasData } from './impresoras.data';
import {
  PRINTER_LIMITS,
  PRINTER_STATE_LABELS,
  type PrinterRecord,
  type PrinterState,
} from './impresoras.models';
import { previewMachineRate } from './printer-rate';

const STATES = Object.keys(PRINTER_STATE_LABELS) as PrinterState[];

const MAX_POWER_W = PRINTER_LIMITS.powerW;
const MAX_HOURS = PRINTER_LIMITS.hours;
const MAX_HOURS_PER_YEAR = PRINTER_LIMITS.hoursPerYear;
const MAX_MONEY = PRINTER_LIMITS.money;

const POSITIVE_MAX_MESSAGES = {
  expectedHoursPerYear: 'Un año tiene como mucho 8784 horas.',
  assetCost: 'No puede pasar de S/ 9,999,999,999.99.',
  usefulLifeHours: 'No puede pasar de 99,999,999.99 horas.',
} as const;

/**
 * Register or edit a printer together with its asset. The asset is not an
 * optional extra: the hourly rate is computed from it, and a printer without
 * one makes every quote cheaper without any error showing up.
 */
@Component({
  selector: 'app-printer-form',
  imports: [ReactiveFormsModule, Field, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    `
      .rate { margin: 0 0 1rem; padding: 0.75rem 0.9rem; border-radius: var(--radius); background: var(--accent-soft); }
      .rate strong { font-size: 1.1rem; font-variant-numeric: tabular-nums; }
      .rate ul { margin: 0.4rem 0 0; padding-left: 1.2rem; font-size: 0.85rem; color: var(--warn); }
    `,
  ],
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>{{ printer() ? 'Editar impresora' : 'Nueva impresora' }}</h3>

      <div class="grid two">
        <pp-field label="Nombre" [required]="true" [error]="nameError()" hint="Como la llaman en el taller. No puede repetirse.">
          <input formControlName="name" placeholder="Ej.: A1 mini" />
        </pp-field>
        <pp-field label="Modelo" hint="Marca y modelo, si quieres distinguirla.">
          <input formControlName="model" placeholder="Ej.: Bambu Lab A1 mini" />
        </pp-field>
        @if (printer()) {
          <pp-field label="Estado" hint="«Retirada» la saca del cotizador y de las nuevas impresiones; su historial se conserva.">
            <select formControlName="status">
              @for (state of states; track state) {
                <option [value]="state">{{ stateLabels[state] }}</option>
              }
            </select>
          </pp-field>
        }
        <pp-field
          label="Horas de uso iniciales"
          [required]="true"
          [error]="hoursError('initialHours')"
          hint="Las que la máquina ya traía al empezar a registrarla aquí. Si es nueva, 0. Ej.: 175."
        >
          <input type="number" min="0" step="any" formControlName="initialHours" inputmode="decimal" />
        </pp-field>
      </div>

      <h3>Consumo y mantenimiento</h3>
      <div class="grid two">
        <pp-field
          label="Potencia media (W)"
          [required]="true"
          [error]="nonNegativeError('avgPowerW')"
          hint="Alimenta el costo de energía de cada impresión. La A1 mini con PLA gasta unos 57 W."
        >
          <input type="number" min="0" step="any" formControlName="avgPowerW" inputmode="decimal" />
        </pp-field>
        <pp-field
          label="Horas esperadas al año"
          [required]="true"
          [error]="positiveError('expectedHoursPerYear', 'Indica cuántas horas al año esperas que trabaje.')"
          hint="Reparte el mantenimiento entre las horas que trabajará. Ej.: 2000."
        >
          <input type="number" min="0" step="any" formControlName="expectedHoursPerYear" inputmode="decimal" />
        </pp-field>
        <pp-field
          label="Presupuesto de mantenimiento al año (S/)"
          [required]="true"
          [error]="nonNegativeError('maintenanceBudgetPerYear')"
          hint="Boquillas, placas, lubricante, repuestos. Ej.: 240."
        >
          <input type="number" min="0" step="0.01" formControlName="maintenanceBudgetPerYear" inputmode="decimal" />
        </pp-field>
      </div>

      <h3>Activo: de dónde sale la depreciación</h3>
      <p class="muted">
        El costo de la impresora entre su vida útil en horas es lo que cuesta cada hora de máquina por desgaste.
        Si falta, todas las cotizaciones salen más baratas de lo que son.
      </p>
      <div class="grid two">
        <pp-field
          label="Costo de la impresora (S/)"
          [required]="true"
          [error]="positiveError('assetCost', 'Indica cuánto costó la impresora.')"
          hint="Lo que pagaste, con sus accesorios (AMS, etc.). Ej.: 1500."
        >
          <input type="number" min="0" step="0.01" formControlName="assetCost" inputmode="decimal" />
        </pp-field>
        <pp-field
          label="Vida útil (horas de impresión)"
          [required]="true"
          [error]="positiveError('usefulLifeHours', 'Indica las horas que esperas que dure.')"
          hint="Horas hasta que haya que reemplazarla. Ej.: 5000 horas son unos 2.5 años a 2000 h al año."
        >
          <input type="number" min="0" step="any" formControlName="usefulLifeHours" inputmode="decimal" />
        </pp-field>
      </div>

      <div class="rate" aria-live="polite">
        Hora de máquina con estos datos: <strong>{{ preview().ratePerHour | money: 2 }}</strong>
        <span class="muted"> (depreciación + mantenimiento)</span>
        @if (preview().gaps.length > 0) {
          <ul>
            @for (gap of preview().gaps; track gap) {
              <li>{{ gap }}</li>
            }
          </ul>
        }
      </div>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar impresora' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class PrinterForm implements OnInit {
  private readonly data = inject(ImpresorasData);
  /** A refusal of the role reads it again, so the tabs stop offering what the database denies. */
  private readonly workspace = inject(CurrentWorkspace);

  /** Null to register a new one. */
  readonly printer = input<PrinterRecord | null>(null);
  readonly saved = output<string>();
  readonly cancelled = output<void>();

  protected readonly states = STATES;
  protected readonly stateLabels = PRINTER_STATE_LABELS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    model: new FormControl('', { nonNullable: true }),
    status: new FormControl<PrinterState>('active', { nonNullable: true }),
    initialHours: new FormControl<number | null>(0, [
      Validators.required,
      Validators.min(0),
      Validators.max(MAX_HOURS),
      maxDecimals(2),
    ]),
    avgPowerW: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(MAX_POWER_W),
      maxDecimals(2),
    ]),
    expectedHoursPerYear: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(MAX_HOURS_PER_YEAR),
      maxDecimals(2),
    ]),
    maintenanceBudgetPerYear: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(MAX_MONEY),
      maxDecimals(2),
    ]),
    assetCost: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(MAX_MONEY),
      maxDecimals(2),
    ]),
    usefulLifeHours: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(MAX_HOURS),
      maxDecimals(2),
    ]),
  });

  private readonly values = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly preview = computed(() => {
    const value = this.values();
    return previewMachineRate({
      assetCost: value.assetCost ?? 0,
      usefulLifeHours: value.usefulLifeHours ?? 0,
      maintenanceBudgetPerYear: value.maintenanceBudgetPerYear ?? 0,
      expectedHoursPerYear: value.expectedHoursPerYear ?? 0,
    });
  });

  ngOnInit(): void {
    const printer = this.printer();
    if (!printer) return;

    // A printer registered without an asset arrives with zeros: leave those
    // fields empty so the form asks for them instead of accepting the zero.
    this.form.setValue({
      name: printer.name,
      model: printer.model ?? '',
      status: printer.status,
      initialHours: printer.initialHours,
      avgPowerW: printer.avgPowerW,
      expectedHoursPerYear: printer.expectedHoursPerYear || null,
      maintenanceBudgetPerYear: printer.maintenanceBudgetPerYear,
      assetCost: printer.assetCost || null,
      usefulLifeHours: printer.usefulLifeHours || null,
    });
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre de la impresora.' });
  }

  protected hoursError(control: 'initialHours'): string | null {
    return errorOf(this.form.controls[control], {
      required: 'Indica las horas iniciales (0 si es nueva).',
      min: 'Las horas no pueden ser negativas.',
      max: 'No puede pasar de 99,999,999.99 horas.',
      decimals: 'Usa como mucho 2 decimales.',
    });
  }

  protected nonNegativeError(control: 'avgPowerW' | 'maintenanceBudgetPerYear'): string | null {
    return errorOf(this.form.controls[control], {
      required: 'Indica un valor (0 si no aplica).',
      min: 'No puede ser negativo.',
      max: control === 'avgPowerW' ? 'No puede pasar de 999,999.99 W.' : 'No puede pasar de S/ 9,999,999,999.99.',
      decimals: 'Usa como mucho 2 decimales.',
    });
  }

  protected positiveError(
    control: 'expectedHoursPerYear' | 'assetCost' | 'usefulLifeHours',
    requiredMessage: string,
  ): string | null {
    return errorOf(this.form.controls[control], {
      required: requiredMessage,
      min: 'Debe ser mayor que 0.',
      max: POSITIVE_MAX_MESSAGES[control],
      decimals: 'Usa como mucho 2 decimales.',
    });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      const id = await this.data.savePrinter(this.printer(), {
        name: value.name,
        model: textOrNull(value.model),
        status: value.status,
        initialHours: value.initialHours ?? 0,
        avgPowerW: value.avgPowerW ?? 0,
        maintenanceBudgetPerYear: value.maintenanceBudgetPerYear ?? 0,
        expectedHoursPerYear: value.expectedHoursPerYear ?? 0,
        assetCost: value.assetCost ?? 0,
        usefulLifeHours: value.usefulLifeHours ?? 0,
      });
      this.saved.emit(id);
    } catch (error) {
      // Nothing was saved, asset included: save_printer is all or nothing.
      this.error.set(friendlyError(error, 'No pudimos guardar la impresora. No se guardó nada.'));
      await this.workspace.afterRefusal(error);
    } finally {
      this.saving.set(false);
    }
  }
}
