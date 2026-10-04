import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { todayLocal } from '../configuracion/shared/dates';
import { errorOf, textOrNull } from '../configuracion/shared/form-errors';
import { friendlyError } from '../configuracion/shared/friendly-error';
import { SECTION_STYLES } from '../configuracion/shared/styles';
import { ImpresorasData } from './impresoras.data';
import { COMPONENT_KINDS, COMPONENT_LABELS, type ComponentKind } from './impresoras.models';

const HOURS_PRECISION = 100;

/** Register a part that was just installed on the printer. */
@Component({
  selector: 'app-component-form',
  imports: [ReactiveFormsModule, Field],
  styles: SECTION_STYLES,
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>Instalar un componente</h3>

      <div class="grid two">
        <pp-field label="Tipo" [required]="true">
          <select formControlName="kind">
            @for (kind of kinds; track kind) {
              <option [value]="kind">{{ labels[kind] }}</option>
            }
          </select>
        </pp-field>
        <pp-field label="Descripción" hint="Marca, diámetro, referencia…">
          <input formControlName="description" placeholder="Ej.: Boquilla 0.4 mm de acero endurecido" />
        </pp-field>
        <pp-field label="Fecha de instalación" [required]="true" [error]="dateError()">
          <input type="date" formControlName="installedOn" />
        </pp-field>
        <pp-field label="Horas de la impresora al instalar" [required]="true" hint="Por defecto, las horas acumuladas de hoy." [error]="hoursError()">
          <input type="number" min="0" step="any" formControlName="hoursAtInstall" inputmode="decimal" />
        </pp-field>
      </div>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar componente' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class ComponentForm {
  private readonly data = inject(ImpresorasData);

  readonly printerId = input.required<string>();
  readonly currentHours = input.required<number>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly kinds = COMPONENT_KINDS;
  protected readonly labels = COMPONENT_LABELS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    kind: new FormControl<ComponentKind>('nozzle', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    installedOn: new FormControl(todayLocal(), { nonNullable: true, validators: [Validators.required] }),
    hoursAtInstall: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
  });

  ngOnInit(): void {
    this.form.patchValue({ hoursAtInstall: Math.round(this.currentHours() * HOURS_PRECISION) / HOURS_PRECISION });
  }

  protected dateError(): string | null {
    return errorOf(this.form.controls.installedOn, { required: 'Indica la fecha de instalación.' });
  }

  protected hoursError(): string | null {
    return errorOf(this.form.controls.hoursAtInstall, {
      required: 'Indica las horas de la impresora.',
      min: 'Las horas no pueden ser negativas.',
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.addComponent(this.printerId(), {
        kind: value.kind,
        description: textOrNull(value.description),
        installedOn: value.installedOn,
        hoursAtInstall: value.hoursAtInstall ?? 0,
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el componente. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
