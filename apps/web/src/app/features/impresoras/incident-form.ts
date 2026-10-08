import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { inputToIso, nowForInput } from '../../core/dates';
import { errorOf, notInFuture, requiredText, textOrNull, wholeNumber } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { ImpresorasData } from './impresoras.data';
import { PRINTER_LIMITS, type IncidentRecord } from './impresoras.models';

const LIMA_OFFSET_MS = 5 * 3_600_000;

/** Log a new incident, or complete and close an existing one. */
@Component({
  selector: 'app-incident-form',
  imports: [ReactiveFormsModule, Field],
  styles: SECTION_STYLES,
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>{{ heading() }}</h3>

      <pp-field label="Síntoma" [required]="true" [error]="symptomError()" hint="Lo que se vio: atasco, capa desplazada, error en pantalla…">
        <input formControlName="symptom" />
      </pp-field>
      <pp-field label="Cuándo ocurrió" [required]="true" [error]="dateError()">
        <input type="datetime-local" formControlName="occurredAt" />
      </pp-field>
      <pp-field label="Causa">
        <textarea rows="2" formControlName="cause"></textarea>
      </pp-field>
      <pp-field label="Solución">
        <textarea rows="2" formControlName="fix"></textarea>
      </pp-field>

      <div class="grid two">
        <pp-field label="Tiempo fuera de servicio (minutos)" [error]="downtimeError()">
          <input type="number" min="0" step="1" formControlName="downtimeMin" inputmode="numeric" />
        </pp-field>
        <pp-field label="Costo (S/)" hint="Repuestos o reparación. 0 si no hubo." [error]="costError()">
          <input type="number" min="0" step="0.01" formControlName="cost" inputmode="decimal" />
        </pp-field>
      </div>

      <label class="check">
        <input type="checkbox" formControlName="resolved" /> Incidente resuelto (cerrarlo)
      </label>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class IncidentForm {
  private readonly data = inject(ImpresorasData);

  readonly printerId = input.required<string>();
  readonly incident = input<IncidentRecord | null>(null);
  /** True when the form was opened from "Cerrar": the resolved box starts checked. */
  readonly closing = input(false);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    symptom: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    occurredAt: new FormControl(nowForInput(), { nonNullable: true, validators: [Validators.required, notInFuture] }),
    cause: new FormControl('', { nonNullable: true }),
    fix: new FormControl('', { nonNullable: true }),
    downtimeMin: new FormControl<number | null>(null, [
      Validators.min(0),
      wholeNumber,
      Validators.max(PRINTER_LIMITS.downtimeMinutes),
    ]),
    cost: new FormControl<number | null>(0, [Validators.min(0), Validators.max(PRINTER_LIMITS.money)]),
    resolved: new FormControl(false, { nonNullable: true }),
  });

  protected readonly heading = (): string =>
    this.closing() ? 'Cerrar incidente' : this.incident() ? 'Editar incidente' : 'Nuevo incidente';

  ngOnInit(): void {
    const incident = this.incident();
    if (!incident) return;

    this.form.setValue({
      symptom: incident.symptom,
      occurredAt: this.toInputValue(incident.occurredAt),
      cause: incident.cause ?? '',
      fix: incident.fix ?? '',
      downtimeMin: incident.downtimeMin,
      cost: incident.cost,
      resolved: incident.resolvedAt !== null || this.closing(),
    });
  }

  protected symptomError(): string | null {
    return errorOf(this.form.controls.symptom, { required: 'Describe qué pasó.' });
  }

  protected dateError(): string | null {
    return errorOf(this.form.controls.occurredAt, {
      required: 'Indica cuándo ocurrió.',
      future: 'Se registra lo que ya pasó: la fecha no puede ser futura.',
    });
  }

  protected downtimeError(): string | null {
    return errorOf(this.form.controls.downtimeMin, {
      min: 'El tiempo no puede ser negativo.',
      integer: 'Escribe los minutos sin decimales.',
      max: 'No puede pasar de un año (525,600 minutos).',
    });
  }

  protected costError(): string | null {
    return errorOf(this.form.controls.cost, {
      min: 'El costo no puede ser negativo.',
      max: 'No puede pasar de S/ 9,999,999,999.99.',
    });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const alreadyResolvedAt = this.incident()?.resolvedAt ?? null;
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveIncident(this.printerId(), this.incident()?.id ?? null, {
        occurredAt: inputToIso(value.occurredAt),
        symptom: value.symptom,
        cause: textOrNull(value.cause),
        fix: textOrNull(value.fix),
        downtimeMin: value.downtimeMin,
        cost: value.cost ?? 0,
        resolvedAt: value.resolved ? (alreadyResolvedAt ?? new Date().toISOString()) : null,
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el incidente. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** An ISO instant as the Lima-time value a datetime-local input expects. */
  private toInputValue(iso: string): string {
    return new Date(new Date(iso).getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 16);
  }
}
