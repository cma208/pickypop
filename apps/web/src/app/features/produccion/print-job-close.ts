import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field, FORMAT_PIPES } from '../../ui';
import { explainError } from '../pedidos/pedidos.errors';
import { ProduccionData, type CloseJob, type CloseOutcome, type JobItem } from './produccion.data';
import { FAILURE_CAUSE_LABEL, FAILURE_CAUSES, type FailureCause } from './produccion.labels';
import { describeCounts } from './produccion.outputs';
import { createOutputControl, PrintJobOutputs, type OutputControls } from './print-job-outputs';
import { filamentName } from '../../core/spool-label';
import { neverRan, proposeTime, secondsToSave, type ProposedTime } from './job-time';

type CloseResult = CloseJob['result'];

const RESULT_OPTIONS: { value: CloseResult; label: string }[] = [
  { value: 'success', label: 'Exitosa' },
  { value: 'failed', label: 'Fallida' },
  { value: 'cancelled', label: 'Cancelada' },
];

function createUsageRow(spoolId: string, actualG: number) {
  return new FormGroup({
    spoolId: new FormControl(spoolId, { nonNullable: true }),
    actualG: new FormControl(actualG, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
  });
}

/**
 * Closes a print job: result, real time, real grams per roll and, when it went
 * well, how many of each part came out. Closing moves the stock and cannot be
 * undone, so it asks for one more confirmation.
 */
@Component({
  selector: 'app-print-job-close',
  imports: [ReactiveFormsModule, Field, PrintJobOutputs, ...FORMAT_PIPES],
  template: `
    <form [formGroup]="form" (ngSubmit)="review()" novalidate class="close">
      <fieldset class="results">
        <legend>Resultado</legend>
        @for (option of resultOptions; track option.value) {
          <label [class.chosen]="result() === option.value">
            <input type="radio" formControlName="result" [value]="option.value" />
            {{ option.label }}
          </label>
        }
      </fieldset>

      @if (result() === 'failed') {
        <pp-field label="Causa del fallo" [required]="true" [error]="causeError()">
          <select formControlName="failureCause">
            <option value="">Elige la causa…</option>
            @for (cause of causes; track cause) {
              <option [value]="cause">{{ causeLabel[cause] }}</option>
            }
          </select>
        </pp-field>
      }

      @if (result() !== 'success' && !unstartedCancel()) {
        <pp-field label="Porcentaje completado" hint="Opcional, de 0 a 100." [error]="fieldError('percentComplete', 'Debe estar entre 0 y 100.')">
          <input type="number" inputmode="decimal" min="0" max="100" step="1" formControlName="percentComplete" />
        </pp-field>
      }

      @if (!unstartedCancel()) {
        <div class="grid two">
          <pp-field
            label="Tiempo real (minutos)"
            [required]="result() !== 'cancelled'"
            [hint]="result() === 'cancelled' ? 'Opcional: lo que alcanzó a imprimir. Sin tiempo no se cobra máquina ni luz.' : job().estimatedTimeS ? 'Estimado: ' + (job().estimatedTimeS | duration) : undefined"
            [error]="fieldError('actualMinutes', 'Escribe los minutos reales, en número entero mayor que cero.')"
          >
            <input type="number" inputmode="numeric" min="1" step="1" formControlName="actualMinutes" />
          </pp-field>
        </div>
      }

      @if (result() === 'success') {
        @if (job().plateOutputs.length > 0) {
          <app-print-job-outputs [parts]="job().plateOutputs" [controls]="outputs" [submitted]="submitted()" [idPrefix]="'out-' + job().id + '-'" />
        } @else {
          <p class="muted">{{ job().plateLabel ? 'Su placa no tiene piezas definidas' : 'Sin placa de receta' }}: al cerrarla no entra nada al estante.</p>
        }
      }

      @if (unstartedCancel()) {
        <p class="muted">No llegó a empezar: se cierra sin tiempo real, sin costo y sin descontar filamento.</p>
      } @else if (result() === 'cancelled') {
        <p class="muted">Una impresión cancelada no descuenta filamento.</p>
      } @else {
        <fieldset>
          <legend>{{ result() === 'failed' ? 'Gramos desperdiciados por rollo' : 'Gramos usados por rollo' }}</legend>
          @for (row of usage.controls; track row; let i = $index) {
            <div [formGroup]="row" class="usage">
              <div class="spool">
                <strong>{{ filamentOf(i).spoolCode }}</strong>
                <span class="muted">
                  {{ filament(i) }} · estimado {{ filamentOf(i).estimatedG | grams }}
                  @if (current()[filamentOf(i).spoolId] !== undefined) { · hay {{ current()[filamentOf(i).spoolId] | grams }} }
                </span>
              </div>
              <pp-field label="Gramos reales" [error]="usageError(i)">
                <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="actualG" />
              </pp-field>
            </div>
          } @empty {
            <!-- A job queued from «Por lanzar» gets its rolls on «Iniciar»; closed before that, it has none. -->
            <p class="no-rolls">
              Este trabajo no tiene rollos, así que cerrarlo no descuenta filamento.
              @if (job().status === 'planned') { Si ya se imprimió, usa «Iniciar…» primero para elegir con qué rollos. }
            </p>
          }
        </fieldset>
      }

      <pp-field label="Nota" hint="Opcional">
        <input type="text" formControlName="note" autocomplete="off" />
      </pp-field>

      @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }

      @if (confirming()) {
        <div class="confirm" role="alert">
          <p><strong>Esto no se puede deshacer.</strong> {{ summary() }}</p>
          <div class="row">
            <button type="button" (click)="confirm()" [disabled]="busy()">{{ busy() ? 'Cerrando…' : 'Sí, cerrar impresión' }}</button>
            <button type="button" class="secondary" (click)="confirming.set(false)" [disabled]="busy()">Volver</button>
          </div>
        </div>
      } @else {
        <div class="row">
          <button type="submit">Revisar y cerrar</button>
          <button type="button" class="secondary" (click)="cancelled.emit()">No cerrar</button>
        </div>
      }
    </form>
  `,
  styles: `
    .close { padding-top: 0.75rem; }
    fieldset { border: 1px solid var(--line); border-radius: var(--radius); padding: 0.8rem; margin: 0 0 1rem; }
    legend { font-size: 0.85rem; font-weight: 500; padding: 0 0.4rem; }
    .results { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .results label { display: flex; gap: 0.4rem; align-items: center; padding: 0.4rem 0.8rem; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; }
    .results label.chosen { border-color: var(--accent); background: var(--accent-soft); }
    .results input { width: auto; }
    .usage { display: grid; grid-template-columns: 1fr 9rem; gap: 0.75rem; align-items: start; }
    .spool { display: grid; padding-top: 0.2rem; }
    .no-rolls { margin: 0; font-size: 0.85rem; color: var(--warn); }
    .confirm { padding: 0.8rem; border: 1px solid var(--warn); border-radius: var(--radius); background: var(--warn-soft); margin-bottom: 0.5rem; }
    .confirm p { margin: 0 0 0.6rem; }
    @media (max-width: 30rem) { .usage { grid-template-columns: 1fr; } }
  `,
})
export class PrintJobClose implements OnInit {
  private readonly data = inject(ProduccionData);

  readonly job = input.required<JobItem>();
  readonly closed = output<CloseOutcome>();
  readonly cancelled = output<void>();

  protected readonly resultOptions = RESULT_OPTIONS;
  protected readonly causes = FAILURE_CAUSES;
  protected readonly causeLabel = FAILURE_CAUSE_LABEL;

  protected readonly form = new FormGroup({
    result: new FormControl<CloseResult>('success', { nonNullable: true }),
    failureCause: new FormControl<FailureCause | ''>('', { nonNullable: true }),
    percentComplete: new FormControl<number | null>(null, [Validators.min(0), Validators.max(100)]),
    actualMinutes: new FormControl<number | null>(null, [Validators.min(1), Validators.pattern(/^\d+$/)]),
    note: new FormControl('', { nonNullable: true }),
    usage: new FormArray<ReturnType<typeof createUsageRow>>([]),
    outputs: new FormArray<FormControl<number | null>>([]),
  });

  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly current = signal<Record<string, number>>({});

  private readonly resultValue = toSignal(this.form.controls.result.valueChanges, { initialValue: 'success' as CloseResult });
  protected readonly result = computed(() => this.resultValue());
  /** Cancelled before «Iniciar»: it never ran, so it has no time to ask for. */
  protected readonly unstartedCancel = computed(() => neverRan(this.job().startedAt, this.result()));

  /** The job's estimate, to the second, behind the whole minutes the field proposes. */
  private estimate: ProposedTime | null = null;

  constructor() {
    this.form.controls.result.valueChanges.pipe(takeUntilDestroyed()).subscribe((result) => {
      this.confirming.set(false);
      this.proposeTimeFor(result);
    });
  }

  ngOnInit(): void {
    const job = this.job();
    for (const filament of job.filaments) {
      this.usage.push(createUsageRow(filament.spoolId, filament.estimatedG));
    }
    this.estimate = proposeTime(job.estimatedTimeS);
    if (this.estimate) this.form.controls.actualMinutes.setValue(this.estimate.minutes);
    for (const part of job.plateOutputs) {
      this.outputs.push(createOutputControl(part.unitsPerRun));
    }
    void this.loadCurrentStock();
  }

  protected get usage(): FormArray<ReturnType<typeof createUsageRow>> {
    return this.form.controls.usage;
  }

  protected get outputs(): OutputControls {
    return this.form.controls.outputs;
  }

  protected filamentOf(index: number) {
    return this.job().filaments[index]!;
  }

  /** «PETG Negro»: the code on the roll does not say what material it is. */
  protected filament(index: number): string {
    const roll = this.filamentOf(index);
    return filamentName(roll.materialCode, roll.colorName);
  }

  protected partOf(index: number) {
    return this.job().plateOutputs[index]!;
  }

  protected causeError(): string | null {
    const missing = this.form.controls.failureCause.value === '';
    return missing && (this.form.controls.failureCause.touched || this.submitted()) ? 'Una impresión fallida necesita su causa.' : null;
  }

  protected fieldError(name: 'percentComplete' | 'actualMinutes', message: string): string | null {
    const control = this.form.controls[name];
    const missingTime = name === 'actualMinutes' && this.result() !== 'cancelled' && !control.value;
    const show = control.touched || this.submitted();
    return (control.invalid || missingTime) && show ? message : null;
  }

  protected usageError(index: number): string | null {
    const control = this.usage.at(index).controls.actualG;
    return control.invalid && (control.touched || this.submitted()) ? 'Los gramos no pueden ser negativos.' : null;
  }

  protected summary(): string {
    const result = this.result();
    const total = this.usage.getRawValue().reduce((sum, row) => sum + (row.actualG || 0), 0);
    if (this.unstartedCancel()) return 'Se cerrará como cancelada, sin tiempo ni costo, y no se moverá el stock.';
    if (result === 'cancelled') return 'Se cerrará como cancelada y no se moverá el stock.';
    const verb = result === 'success' ? 'Se descontarán' : 'Se registrarán como merma';
    const grams = `${verb} ${Math.round(total * 100) / 100} g de ${this.usage.length} rollo(s).`;
    if (result !== 'success' || this.job().plateOutputs.length === 0) return grams;

    const counts = this.outputs.getRawValue().map((units, index) => ({ name: this.partOf(index).name, units: units ?? 0 }));
    return `${grams} Entran al estante: ${describeCounts(counts)}.`;
  }

  /** First step: check the form and ask for confirmation. */
  protected review(): void {
    this.submitted.set(true);
    this.error.set(null);
    this.form.markAllAsTouched();

    const result = this.result();
    const needsTime = result !== 'cancelled' && !this.form.controls.actualMinutes.value;
    const needsCause = result === 'failed' && this.form.controls.failureCause.value === '';
    const usageInvalid = result !== 'cancelled' && this.usage.invalid;
    const outputsInvalid = result === 'success' && this.outputs.invalid;
    // Both are hidden for a job that never ran, so whatever they held does not count.
    const ran = !this.unstartedCancel();
    const timeInvalid = ran && this.form.controls.actualMinutes.invalid;
    const percentInvalid = ran && this.form.controls.percentComplete.invalid;

    if (needsTime || needsCause || usageInvalid || outputsInvalid || timeInvalid || percentInvalid) {
      this.error.set('Revisa los campos marcados antes de cerrar.');
      return;
    }
    this.confirming.set(true);
  }

  protected async confirm(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);

    try {
      const outcome = await this.data.closeJob(this.job(), {
        result: value.result,
        actualTimeS: this.unstartedCancel() ? null : secondsToSave(value.actualMinutes, this.estimate),
        usage: value.result === 'cancelled' ? [] : value.usage.map((row) => ({ spoolId: row.spoolId, actualG: row.actualG })),
        failureCause: value.failureCause === '' ? null : value.failureCause,
        percentComplete: this.unstartedCancel() ? null : value.percentComplete,
        outputs: this.job().plateOutputs.map((part, index) => ({
          inventoryItemId: part.inventoryItemId,
          units: value.outputs[index] ?? null,
        })),
        note: value.note.trim() || null,
      });
      this.closed.emit(outcome);
    } catch (error) {
      this.confirming.set(false);
      this.error.set(explainError(error, 'No pudimos cerrar la impresión. No se movió nada; inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * The estimate is a fair guess of how long a finished print took, and no
   * guess at all for a cancelled one: it is what finishing would have taken.
   * So «Cancelada» empties the proposed minutes, and going back to another
   * result brings them back. Minutes the person typed are left alone.
   */
  private proposeTimeFor(result: CloseResult): void {
    const control = this.form.controls.actualMinutes;
    const proposed = this.estimate?.minutes ?? null;
    if (result === 'cancelled' && proposed !== null && control.value === proposed) control.setValue(null);
    if (result !== 'cancelled' && proposed !== null && control.value === null) control.setValue(proposed);
  }

  private async loadCurrentStock(): Promise<void> {
    try {
      const rows = await this.data.stockOf(this.job().filaments.map((f) => f.spoolId));
      this.current.set(Object.fromEntries(rows.map((row) => [row.spoolId, row.beforeG])));
    } catch {
      // The roll stock is a convenience here; closing does not depend on it.
    }
  }
}
