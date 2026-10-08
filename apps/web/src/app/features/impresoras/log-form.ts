import { Component, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { inputToIso, nowForInput } from '../../core/dates';
import { errorOf, notInFuture, textOrNull, wholeNumber } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';
import { ImpresorasData } from './impresoras.data';
import { PRINTER_LIMITS, type LogDraft, type PlanRecord } from './impresoras.models';

const NO_PLAN = '';
const HOURS_PRECISION = 100;

/**
 * Splits what the person wrote from what they ticked. The steps are stored as
 * worded today, because the plan's checklist can be edited later.
 */
export function composeLogContent(
  note: string,
  steps: string[],
  done: ReadonlySet<number>,
): Pick<LogDraft, 'note' | 'checklistDone'> {
  return {
    note: textOrNull(note),
    checklistDone: steps.filter((_, index) => done.has(index)),
  };
}

/** Register a maintenance that was done, optionally against one of the plans. */
@Component({
  selector: 'app-log-form',
  imports: [ReactiveFormsModule, Field],
  styles: SECTION_STYLES,
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>Registrar un mantenimiento</h3>

      <pp-field label="¿Qué se hizo?" hint="Elige el plan o déjalo como trabajo suelto.">
        <select formControlName="planId">
          <option value="">Trabajo suelto (sin plan)</option>
          @for (plan of plans(); track plan.id) {
            <option [value]="plan.id">{{ plan.task }}</option>
          }
        </select>
      </pp-field>

      <div class="grid two">
        <pp-field label="Fecha y hora" [required]="true" [error]="dateError()">
          <input type="datetime-local" formControlName="performedAt" />
        </pp-field>
        <pp-field label="Horas de la impresora" [required]="true" hint="Lo que marca la máquina hoy. Por defecto, las horas acumuladas." [error]="hoursError()">
          <input type="number" min="0" step="any" formControlName="printerHours" inputmode="decimal" />
        </pp-field>
        <pp-field label="Duración (minutos)" [error]="durationError()">
          <input type="number" min="0" step="1" formControlName="durationMin" inputmode="numeric" />
        </pp-field>
        <pp-field label="Costo (S/)" hint="Repuestos u otros gastos. 0 si no hubo." [error]="costError()">
          <input type="number" min="0" step="0.01" formControlName="cost" inputmode="decimal" />
        </pp-field>
      </div>

      @if (steps().length > 0) {
        <fieldset>
          <legend>Lista de verificación</legend>
          @for (step of steps(); track $index) {
            <label class="check">
              <input type="checkbox" [checked]="done().has($index)" (change)="toggle($index)" />
              {{ step }}
            </label>
          }
          <p class="muted">Lo marcado se guarda junto al registro.</p>
        </fieldset>
      }

      <pp-field label="Notas">
        <textarea rows="3" formControlName="note"></textarea>
      </pp-field>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Registrar' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class LogForm {
  private readonly data = inject(ImpresorasData);
  /** A refusal of the role reads it again, so the tabs stop offering what the database denies. */
  private readonly workspace = inject(CurrentWorkspace);

  readonly printerId = input.required<string>();
  readonly currentHours = input.required<number>();
  readonly plans = input.required<PlanRecord[]>();
  readonly initialPlanId = input<string | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<ReadonlySet<number>>(new Set());

  protected readonly form = new FormGroup({
    planId: new FormControl(NO_PLAN, { nonNullable: true }),
    performedAt: new FormControl(nowForInput(), { nonNullable: true, validators: [Validators.required, notInFuture] }),
    printerHours: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(PRINTER_LIMITS.hours),
    ]),
    durationMin: new FormControl<number | null>(null, [
      Validators.min(0),
      wholeNumber,
      Validators.max(PRINTER_LIMITS.maintenanceMinutes),
    ]),
    cost: new FormControl<number | null>(0, [Validators.min(0), Validators.max(PRINTER_LIMITS.money)]),
    note: new FormControl('', { nonNullable: true }),
  });

  private readonly selectedPlan = toSignal(this.form.controls.planId.valueChanges, { initialValue: NO_PLAN });

  protected readonly steps = (): string[] =>
    this.plans().find((plan) => plan.id === this.selectedPlan())?.checklist ?? [];

  ngOnInit(): void {
    const hours = Math.round(this.currentHours() * HOURS_PRECISION) / HOURS_PRECISION;
    this.form.patchValue({ planId: this.initialPlanId() ?? NO_PLAN, printerHours: hours });
    this.form.controls.planId.valueChanges.subscribe(() => this.done.set(new Set()));
  }

  protected toggle(index: number): void {
    const next = new Set(this.done());
    if (!next.delete(index)) next.add(index);
    this.done.set(next);
  }

  protected dateError(): string | null {
    return errorOf(this.form.controls.performedAt, {
      required: 'Indica cuándo se hizo.',
      future: 'Se registra lo que ya se hizo: la fecha no puede ser futura.',
    });
  }

  protected durationError(): string | null {
    return errorOf(this.form.controls.durationMin, {
      min: 'La duración no puede ser negativa.',
      integer: 'Escribe los minutos sin decimales.',
      max: 'Un mantenimiento no dura más de 24 horas (1440 minutos).',
    });
  }

  protected costError(): string | null {
    return errorOf(this.form.controls.cost, {
      min: 'El costo no puede ser negativo.',
      max: 'No puede pasar de S/ 9,999,999,999.99.',
    });
  }

  protected hoursError(): string | null {
    return errorOf(this.form.controls.printerHours, {
      required: 'Indica las horas de la impresora.',
      min: 'Las horas no pueden ser negativas.',
      max: 'No puede pasar de 99,999,999.99 horas.',
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
      await this.data.logMaintenance(this.printerId(), {
        planId: value.planId === NO_PLAN ? null : value.planId,
        performedAt: inputToIso(value.performedAt),
        printerHours: value.printerHours ?? 0,
        durationMin: value.durationMin,
        cost: value.cost ?? 0,
        ...composeLogContent(value.note, this.steps(), this.done()),
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos registrar el mantenimiento. Inténtalo de nuevo.'));
      await this.workspace.afterRefusal(error);
    } finally {
      this.saving.set(false);
    }
  }
}
