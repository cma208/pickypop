import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { inputToIso, nowForInput } from '../configuracion/shared/dates';
import { errorOf, textOrNull } from '../configuracion/shared/form-errors';
import { friendlyError } from '../configuracion/shared/friendly-error';
import { SECTION_STYLES } from '../configuracion/shared/styles';
import { ImpresorasData } from './impresoras.data';
import type { IncidentRecord } from './impresoras.models';

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
      <pp-field label="Cuándo ocurrió" [required]="true">
        <input type="datetime-local" formControlName="occurredAt" />
      </pp-field>
      <pp-field label="Causa">
        <textarea rows="2" formControlName="cause"></textarea>
      </pp-field>
      <pp-field label="Solución">
        <textarea rows="2" formControlName="fix"></textarea>
      </pp-field>

      <div class="grid two">
        <pp-field label="Tiempo fuera de servicio (minutos)">
          <input type="number" min="0" step="1" formControlName="downtimeMin" inputmode="numeric" />
        </pp-field>
        <pp-field label="Costo (S/)" hint="Repuestos o reparación. 0 si no hubo.">
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
    symptom: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    occurredAt: new FormControl(nowForInput(), { nonNullable: true, validators: [Validators.required] }),
    cause: new FormControl('', { nonNullable: true }),
    fix: new FormControl('', { nonNullable: true }),
    downtimeMin: new FormControl<number | null>(null, [Validators.min(0)]),
    cost: new FormControl<number | null>(0, [Validators.min(0)]),
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

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

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
