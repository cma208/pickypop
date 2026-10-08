import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Card, Field } from '../../ui';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { ConfiguracionData } from './configuracion.data';
import { CurrentWorkspace } from '../../core/workspace';
import {
  MAX_CHANGEOVER_MINUTES,
  MIN_CHANGEOVER_SAMPLES,
  scheduleProblem,
  windowExample,
  type ScheduleDraft,
} from './schedule.model';

/** When a hold ends by default, in the words the hold itself is shown with. */
const HOLD_DAY_OPTIONS = [
  { value: 0, label: 'el mismo día' },
  { value: 1, label: 'el día siguiente' },
  { value: 2, label: 'a los 2 días' },
  { value: 3, label: 'a los 3 días' },
];

/**
 * When the printer may run and how long a hold lasts. The plan reads both to
 * promise dates; changing them moves every estimated date at once, never the
 * dates already promised to a customer.
 */
@Component({
  selector: 'app-schedule-section',
  imports: [ReactiveFormsModule, Card, Field, AsyncState],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Horario de impresión y separos">
        <p class="muted">
          El plan usa este horario para decir para cuándo estaría un pedido. Cambiarlo mueve las fechas estimadas al
          instante; las fechas que ya prometiste a un cliente no se tocan.
        </p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="grid two">
            <pp-field label="La primera placa empieza desde">
              <input type="time" formControlName="firstStart" />
            </pp-field>
            <pp-field label="La última puede empezar hasta">
              <input type="time" formControlName="lastStart" />
            </pp-field>
            <pp-field label="Todo tiene que terminar antes de" hint="00:00 es medianoche.">
              <input type="time" formControlName="endBy" />
            </pp-field>
          </div>
          <p class="notice">{{ example() }}</p>

          <pp-field label="Cambio de placa (minutos)" [hint]="changeoverHint()">
            <input type="number" min="0" [max]="maxChangeover" step="1" inputmode="numeric" formControlName="changeoverMinutes" />
          </pp-field>

          <div class="grid two">
            <pp-field label="Un separo vence" hint="Al enviar una proforma o poner un pedido en espera. Se puede cambiar en cada uno.">
              <select formControlName="holdDays">
                @for (option of holdDayOptions; track option.value) {
                  <option [ngValue]="option.value">{{ option.label }}</option>
                }
              </select>
            </pp-field>
            <pp-field label="a las">
              <input type="time" formControlName="holdTime" />
            </pp-field>
          </div>

          @if (problem(); as message) { <p class="error" role="alert">{{ message }}</p> }
          @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
          @if (saved()) { <p role="status">Horario guardado. Las fechas estimadas ya lo usan.</p> }
          @if (canEdit()) {
            <div class="form-actions">
              <button type="submit" [disabled]="saving() || problem() !== null">{{ saving() ? 'Guardando…' : 'Guardar horario' }}</button>
            </div>
          } @else {
            <p class="notice warn">Solo el dueño del taller puede cambiar el horario.</p>
          }
        </form>
      </pp-card>
    </pp-async>
  `,
})
export class ScheduleSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly holdDayOptions = HOLD_DAY_OPTIONS;
  protected readonly maxChangeover = MAX_CHANGEOVER_MINUTES;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly workspace = inject(CurrentWorkspace);
  /** Configuration is the owner's (ADR-025); anyone else reads it. Read from `CurrentWorkspace`, the one place that reads the role. */
  protected readonly canEdit = this.workspace.isOwner;
  private readonly measured = signal<{ minutes: number | null; samples: number }>({ minutes: null, samples: 0 });

  protected readonly form = new FormGroup({
    firstStart: new FormControl('06:00', { nonNullable: true, validators: [Validators.required] }),
    lastStart: new FormControl('23:00', { nonNullable: true, validators: [Validators.required] }),
    endBy: new FormControl('00:00', { nonNullable: true, validators: [Validators.required] }),
    changeoverMinutes: new FormControl(15, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    holdDays: new FormControl(1, { nonNullable: true }),
    holdTime: new FormControl('23:00', { nonNullable: true, validators: [Validators.required] }),
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  private readonly draft = computed<ScheduleDraft>(() => ({ ...this.form.getRawValue(), ...this.value() }) as ScheduleDraft);

  protected readonly problem = computed(() => scheduleProblem(this.draft()));
  protected readonly example = computed(() => windowExample(this.draft()));

  protected readonly changeoverHint = computed(() => {
    const { minutes, samples } = this.measured();
    if (minutes !== null && samples >= MIN_CHANGEOVER_SAMPLES) {
      return `Medido en ${samples} cambios: ${minutes} min (lo que se cumple tres de cada cuatro veces). El plan usa lo medido; este valor queda de respaldo.`;
    }
    return `El plan usa este valor hasta tener ${MIN_CHANGEOVER_SAMPLES} cambios medidos (van ${samples}). Se mide solo, entre el fin estimado de una impresión y el inicio de la siguiente.`;
  });

  constructor() {
    void this.load();
  }

  /**
   * Every reason not to save is in `problem()`, shown above the button: the
   * empty times used to leave the form invalid while the button stayed active
   * and the click did nothing, with nothing said (T1-20).
   */
  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.saved.set(false);
    if (this.problem()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.data.saveSchedule(this.form.getRawValue());
      this.saved.set(true);
      this.form.markAsPristine();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el horario.'));
      if (await this.workspace.afterRefusal(error)) await this.load();
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const [schedule] = await Promise.all([this.data.schedule(), this.workspace.info()]);
      const { measuredMinutes, samples, ...draft } = schedule;
      this.form.setValue(draft);
      this.measured.set({ minutes: measuredMinutes, samples });
      if (this.canEdit()) this.form.enable();
      else this.form.disable();
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar el horario.'));
    } finally {
      this.loading.set(false);
    }
  }
}
