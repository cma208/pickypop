import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Card, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import {
  CURRENCIES,
  RUC_PATTERN,
  TAX_REGIMES,
  TAX_REGIME_HELP,
  TAX_REGIME_LABELS,
  TIMEZONES,
  type TaxRegime,
} from './configuracion.models';
import { errorOf, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';

/** Workshop data: name, currency, time zone, tax regime and RUC. */
@Component({
  selector: 'app-workshop-section',
  imports: [ReactiveFormsModule, Card, Field, AsyncState],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Datos del taller">
        @if (!canEdit()) {
          <p class="notice warn">Solo el dueño del taller puede cambiar estos datos. Aquí los ves en modo lectura.</p>
        }

        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="grid two">
            <pp-field label="Nombre del taller" [required]="true" [error]="nameError()">
              <input formControlName="name" />
            </pp-field>
            <pp-field label="Razón social" hint="Opcional. Solo si tienes RUC.">
              <input formControlName="legalName" />
            </pp-field>
            <pp-field label="Moneda">
              <select formControlName="currency">
                @for (currency of currencies; track currency) {
                  <option [value]="currency">{{ currency }}</option>
                }
              </select>
            </pp-field>
            <pp-field label="Zona horaria">
              <select formControlName="timezone">
                @for (zone of timezones(); track zone) {
                  <option [value]="zone">{{ zone }}</option>
                }
              </select>
            </pp-field>
          </div>

          <pp-field label="Régimen tributario" [required]="true">
            <select formControlName="taxRegime">
              @for (regime of regimes; track regime) {
                <option [value]="regime">{{ regimeLabels[regime] }}</option>
              }
            </select>
          </pp-field>
          <p class="notice">{{ regimeHelp[regime()] }}</p>

          <pp-field
            label="RUC"
            [required]="regime() !== 'none'"
            hint="11 dígitos, sin espacios ni letras. Ej.: 20123456789."
            [error]="rucError()"
          >
            <input formControlName="ruc" inputmode="numeric" maxlength="11" autocomplete="off" />
          </pp-field>

          @if (error(); as message) {
            <p class="error" role="alert">{{ message }}</p>
          }
          @if (saved()) {
            <p role="status">Datos del taller guardados.</p>
          }
          @if (canEdit()) {
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button>
            </div>
          }
        </form>
      </pp-card>
    </pp-async>
  `,
})
export class WorkshopSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly currencies = CURRENCIES;
  protected readonly regimes = TAX_REGIMES;
  protected readonly regimeLabels = TAX_REGIME_LABELS;
  protected readonly regimeHelp = TAX_REGIME_HELP;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canEdit = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    legalName: new FormControl('', { nonNullable: true }),
    currency: new FormControl('PEN', { nonNullable: true }),
    timezone: new FormControl('America/Lima', { nonNullable: true }),
    taxRegime: new FormControl<TaxRegime>('none', { nonNullable: true }),
    ruc: new FormControl('', { nonNullable: true }),
  });

  protected readonly regime = toSignal(this.form.controls.taxRegime.valueChanges, {
    initialValue: 'none' as TaxRegime,
  });
  private readonly currentZone = signal('America/Lima');
  /** The standard list plus whatever zone the workshop already has. */
  protected readonly timezones = computed(() =>
    TIMEZONES.includes(this.currentZone()) ? TIMEZONES : [this.currentZone(), ...TIMEZONES],
  );

  constructor() {
    void this.load();
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre del taller.' });
  }

  protected rucError(): string | null {
    const ruc = this.form.controls.ruc;
    if (!(ruc.touched || ruc.dirty)) return null;

    const value = ruc.value.trim();
    if (this.regime() !== 'none' && value === '') return 'Con este régimen el RUC es obligatorio.';
    if (value !== '' && !RUC_PATTERN.test(value)) return 'El RUC debe tener exactamente 11 dígitos.';
    return null;
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.saved.set(false);
    if (this.form.invalid || this.rucError() || this.saving()) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.updateWorkshop({
        name: value.name,
        legalName: textOrNull(value.legalName),
        currency: value.currency,
        timezone: value.timezone,
        taxRegime: value.taxRegime,
        ruc: textOrNull(value.ruc),
      });
      this.saved.set(true);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar los datos del taller.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const [workshop, role] = await Promise.all([this.data.workshop(), this.data.currentRole()]);
      this.currentZone.set(workshop.timezone);
      this.form.setValue({
        name: workshop.name,
        legalName: workshop.legalName ?? '',
        currency: workshop.currency,
        timezone: workshop.timezone,
        taxRegime: workshop.taxRegime,
        ruc: workshop.ruc ?? '',
      });

      this.canEdit.set(role === 'owner');
      if (role !== 'owner') this.form.disable();
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los datos del taller.'));
    } finally {
      this.loading.set(false);
    }
  }
}
