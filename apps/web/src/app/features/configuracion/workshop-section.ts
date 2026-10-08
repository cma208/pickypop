import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AsyncState, Card, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import {
  APP_CURRENCY,
  APP_CURRENCY_LABEL,
  APP_TIMEZONE_LABEL,
  RUC_PATTERN,
  TAX_REGIMES,
  TAX_REGIME_HELP,
  TAX_REGIME_LABELS,
  type TaxRegime,
} from './configuracion.models';
import { DEFAULT_TIMEZONE } from '../../core/dates';
import { errorOf, requiredText, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { isOwnerRole } from '../../core/workspace';

/**
 * Workshop data: name, tax regime and RUC. Currency and time zone are shown,
 * not offered: every screen formats money in soles and dates in Lima time, so
 * choosing another one would only make the database and the screens disagree
 * (T1-23).
 */
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
              <input [value]="currencyLabel" readonly />
            </pp-field>
            <pp-field label="Zona horaria">
              <input [value]="timezoneLabel" readonly />
            </pp-field>
          </div>
          <p class="muted">
            La aplicación calcula todos los montos en soles y todas las fechas en hora de Lima, así que la moneda y la
            zona horaria no se cambian aquí.
          </p>
          @if (storedElsewhere(); as stored) {
            <p class="notice warn" role="status">
              Este taller tiene guardado {{ stored }}, pero las pantallas usan soles y hora de Lima.
            </p>
          }

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

  protected readonly regimes = TAX_REGIMES;
  protected readonly regimeLabels = TAX_REGIME_LABELS;
  protected readonly regimeHelp = TAX_REGIME_HELP;
  protected readonly currencyLabel = APP_CURRENCY_LABEL;
  protected readonly timezoneLabel = APP_TIMEZONE_LABEL;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  private readonly stored = signal<{ currency: string; timezone: string } | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    legalName: new FormControl('', { nonNullable: true }),
    taxRegime: new FormControl<TaxRegime>('none', { nonNullable: true }),
    ruc: new FormControl('', { nonNullable: true }),
  });

  protected readonly regime = toSignal(this.form.controls.taxRegime.valueChanges, {
    initialValue: 'none' as TaxRegime,
  });

  /** What the workshop row says when it is not what the screens use. */
  protected readonly storedElsewhere = computed(() => {
    const stored = this.stored();
    if (!stored) return null;
    const odd = [
      stored.currency !== APP_CURRENCY ? `la moneda ${stored.currency}` : null,
      stored.timezone !== DEFAULT_TIMEZONE ? `la zona ${stored.timezone}` : null,
    ].filter((part): part is string => part !== null);
    return odd.length > 0 ? odd.join(' y ') : null;
  });

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
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.saved.set(false);
    if (this.form.invalid || this.rucError()) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.updateWorkshop({
        name: value.name,
        legalName: textOrNull(value.legalName),
        taxRegime: value.taxRegime,
        ruc: textOrNull(value.ruc),
      });
      this.saved.set(true);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar los datos del taller.'));
      if (await this.data.afterRefusal(error)) await this.load();
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const [workshop, role] = await Promise.all([this.data.workshop(), this.data.currentRole()]);
      this.stored.set({ currency: workshop.currency, timezone: workshop.timezone });
      this.form.reset({
        name: workshop.name,
        legalName: workshop.legalName ?? '',
        taxRegime: workshop.taxRegime,
        ruc: workshop.ruc ?? '',
      });

      this.canEdit.set(isOwnerRole(role));
      if (isOwnerRole(role)) this.form.enable();
      else this.form.disable();
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los datos del taller.'));
    } finally {
      this.loading.set(false);
    }
  }
}
