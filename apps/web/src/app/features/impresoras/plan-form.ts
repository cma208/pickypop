import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { atLeastOneOf, errorOf, requiredText, textOrNull, wholeNumber } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { ImpresorasData } from './impresoras.data';
import { PRINTER_LIMITS, type PlanRecord } from './impresoras.models';

/** Create or edit a maintenance plan: task, triggers and checklist. */
@Component({
  selector: 'app-plan-form',
  imports: [ReactiveFormsModule, Field],
  styles: SECTION_STYLES,
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>{{ plan() ? 'Editar plan' : 'Nuevo plan de mantenimiento' }}</h3>

      <pp-field label="Tarea" [required]="true" [error]="taskError()">
        <input formControlName="task" placeholder="Ej.: Limpiar y lubricar los ejes" />
      </pp-field>

      <div class="grid two">
        <pp-field label="Cada cuántas horas" hint="Horas de impresión. Vacío si solo cuenta por días." [error]="hoursError()">
          <input type="number" min="0" step="any" formControlName="everyHours" inputmode="decimal" />
        </pp-field>
        <pp-field label="Cada cuántos días" hint="Días calendario. Vacío si solo cuenta por horas." [error]="daysError()">
          <input type="number" min="1" step="1" formControlName="everyDays" inputmode="numeric" />
        </pp-field>
      </div>
      @if (triggerError()) {
        <p class="error">{{ triggerError() }}</p>
      }
      <p class="muted">Si indicas horas y días, toca lo que ocurra primero.</p>

      <pp-field label="Lista de verificación" hint="Un paso por línea. Aparecerá para ir marcando al registrar el mantenimiento.">
        <textarea rows="4" formControlName="checklist"></textarea>
      </pp-field>

      <label class="check">
        <input type="checkbox" formControlName="active" /> Plan activo (se vigila en «Qué toca ahora»)
      </label>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar plan' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class PlanForm {
  private readonly data = inject(ImpresorasData);

  readonly printerId = input.required<string>();
  readonly plan = input<PlanRecord | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup(
    {
      task: new FormControl('', { nonNullable: true, validators: [requiredText] }),
      everyHours: new FormControl<number | null>(null, [Validators.min(0.01), Validators.max(PRINTER_LIMITS.hours)]),
      everyDays: new FormControl<number | null>(null, [
        Validators.min(1),
        wholeNumber,
        Validators.max(PRINTER_LIMITS.everyDays),
      ]),
      checklist: new FormControl('', { nonNullable: true }),
      active: new FormControl(true, { nonNullable: true }),
    },
    { validators: atLeastOneOf('everyHours', 'everyDays', 'trigger') },
  );

  ngOnInit(): void {
    const plan = this.plan();
    if (!plan) return;
    this.form.setValue({
      task: plan.task,
      everyHours: plan.everyHours,
      everyDays: plan.everyDays,
      checklist: plan.checklist.join('\n'),
      active: plan.active,
    });
  }

  protected taskError(): string | null {
    return errorOf(this.form.controls.task, { required: 'Escribe qué hay que hacer.' });
  }

  protected hoursError(): string | null {
    return errorOf(this.form.controls.everyHours, {
      min: 'Debe ser mayor que 0.',
      max: 'No puede pasar de 99,999,999.99 horas.',
    });
  }

  protected daysError(): string | null {
    return errorOf(this.form.controls.everyDays, {
      min: 'Debe ser al menos 1 día.',
      integer: 'Escribe los días sin decimales.',
      max: 'No puede pasar de 10 años (3650 días).',
    });
  }

  protected triggerError(): string | null {
    const touched = this.form.controls.everyHours.touched || this.form.controls.everyDays.touched;
    return touched && this.form.errors?.['trigger']
      ? 'Indica cada cuántas horas o cada cuántos días toca la tarea.'
      : null;
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.savePlan(this.printerId(), this.plan()?.id ?? null, {
        task: value.task,
        everyHours: value.everyHours,
        everyDays: value.everyDays,
        checklist: value.checklist
          .split('\n')
          .map((line) => textOrNull(line))
          .filter((line): line is string => line !== null),
        active: value.active,
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el plan. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
