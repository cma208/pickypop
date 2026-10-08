import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { wholeNumber } from '../../core/form-errors';
import { Field, FORMAT_PIPES } from '../../ui';
import { explainProductionError } from './production-errors';
import { ProduccionData, type CloseJob, type CloseOutcome, type JobItem } from './produccion.data';
import { FAILURE_CAUSE_LABEL, FAILURE_CAUSES, JOB_STATUS_LABEL, type FailureCause } from './produccion.labels';
import { describeCounts } from './produccion.outputs';
import { createOutputControl, PrintJobOutputs, type OutputControls } from './print-job-outputs';
import { duration } from '../../core/format';
import { filamentName } from '../../core/spool-label';
import { secondsToSave, type ProposedTime } from './job-time';
import { closeProposal } from './close-proposal';
import { GRAMS_MESSAGE, hundredths, MAX_GRAMS, MAX_MINUTES, toHundredths } from './job-grams';
import { CurrentWorkspace } from '../../core/workspace';

type CloseResult = CloseJob['result'];

const RESULT_OPTIONS: { value: CloseResult; label: string }[] = [
  { value: 'success', label: 'Exitosa' },
  { value: 'failed', label: 'Fallida' },
  { value: 'cancelled', label: 'Cancelada' },
];

/** Long enough for what happened; the card has to hold it. */
export const NOTE_MAX_LENGTH = 500;

function createUsageRow(spoolId: string, actualG: number | null) {
  return new FormGroup({
    spoolId: new FormControl(spoolId, { nonNullable: true }),
    actualG: new FormControl<number | null>(actualG, [Validators.min(0), Validators.max(MAX_GRAMS), hundredths]),
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
      @if (changedSince(); as text) {
        <!-- The card outlives a reload on the order page: the job can move under an open form. -->
        <p class="alert" role="alert">{{ text }}</p>
      }

      @if (opened.status === 'planned') {
        <!-- Closing without «Iniciar» is allowed (a plate launched on the printer directly), but nothing here ran in the app. -->
        <p class="alert-warn" role="status">Este trabajo nunca se inició en la aplicación. Escribe lo que de verdad pasó: el tiempo y los gramos que gastó.</p>
      }

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

      @if (result() !== 'success') {
        <pp-field
          label="Porcentaje completado"
          hint="De 0 a 100. Con él se proponen el tiempo y los gramos; puedes cambiarlos."
          [error]="fieldError('percentComplete', 'Debe estar entre 0 y 100.')"
        >
          <input type="number" inputmode="decimal" min="0" max="100" step="1" formControlName="percentComplete" />
        </pp-field>
      }

      <div class="grid two">
        <pp-field
          label="Tiempo real (minutos)"
          [required]="result() !== 'cancelled'"
          [hint]="timeHint()"
          [error]="fieldError('actualMinutes', minutesMessage)"
        >
          <input type="number" inputmode="numeric" min="1" step="1" formControlName="actualMinutes" />
        </pp-field>
      </div>

      @if (result() === 'success') {
        @if (opened.plateOutputs.length > 0) {
          <app-print-job-outputs [parts]="opened.plateOutputs" [controls]="outputs" [submitted]="submitted()" [idPrefix]="'out-' + opened.id + '-'" />
        } @else {
          <p class="muted">{{ opened.plateLabel ? 'Su placa no tiene piezas definidas' : 'Sin placa de receta' }}: al cerrarla no entra nada al estante.</p>
        }
      }

      <fieldset>
        <legend>{{ gramsLegend() }}</legend>
        @if (result() === 'cancelled' && usage.length > 0) {
          <p class="muted small">Lo que alcanzó a gastar antes de pararla. Vacío o en cero si no llegó a empezar.</p>
        }
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
          @if (overdraw(i); as text) { <p class="warn-text">{{ text }}</p> }
        } @empty {
          <!-- A job queued from «Por lanzar» gets its rolls on «Iniciar»; closed before that, it has none. -->
          <p class="no-rolls">
            Este trabajo no tiene rollos, así que cerrarlo no descuenta filamento.
            @if (opened.status === 'planned') { Si ya se imprimió, usa «Iniciar…» primero para elegir con qué rollos. }
          </p>
        }
      </fieldset>

      <pp-field label="Nota" hint="Opcional" [error]="noteError()">
        <input type="text" formControlName="note" autocomplete="off" [attr.maxlength]="noteMaxLength" />
      </pp-field>

      @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }

      @if (confirming()) {
        <div class="confirm" role="alert">
          <p><strong>Esto no se puede deshacer.</strong> {{ summary() }}</p>
          <div class="row">
            <button type="button" (click)="confirm()" [disabled]="busy() || changedSince() !== null">{{ busy() ? 'Cerrando…' : 'Sí, cerrar impresión' }}</button>
            <button type="button" class="secondary" (click)="confirming.set(false)" [disabled]="busy()">Volver</button>
          </div>
        </div>
      } @else {
        <div class="row">
          <button type="submit" [disabled]="changedSince() !== null">Revisar y cerrar</button>
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
    .small { margin: 0 0 0.5rem; font-size: 0.8rem; }
    .warn-text { margin: -0.4rem 0 0.6rem; font-size: 0.8rem; color: var(--warn); }
    .no-rolls { margin: 0; font-size: 0.85rem; color: var(--warn); }
    .confirm { padding: 0.8rem; border: 1px solid var(--warn); border-radius: var(--radius); background: var(--warn-soft); margin-bottom: 0.5rem; }
    .confirm p { margin: 0 0 0.6rem; overflow-wrap: anywhere; }
    @media (max-width: 30rem) { .usage { grid-template-columns: 1fr; } }
  `,
})
export class PrintJobClose implements OnInit {
  private readonly data = inject(ProduccionData);
  private readonly workspace = inject(CurrentWorkspace);

  readonly job = input.required<JobItem>();
  /**
   * The job as it was when the form opened: its rows, its proposal and the
   * status the close sends as the one this tab saw. The card can outlive a
   * reload (the order page keeps it), and `job()` then brings the job as it
   * is now; closing it with this form's rows would close something else.
   */
  protected opened!: JobItem;
  readonly closed = output<CloseOutcome>();
  readonly cancelled = output<void>();
  /** The database refused the close, with what it said: the job is not what this tab believed. */
  readonly refused = output<string>();

  protected readonly resultOptions = RESULT_OPTIONS;
  protected readonly causes = FAILURE_CAUSES;
  protected readonly causeLabel = FAILURE_CAUSE_LABEL;
  protected readonly noteMaxLength = NOTE_MAX_LENGTH;
  protected readonly minutesMessage = `Escribe los minutos reales, en número entero de 1 a ${MAX_MINUTES}.`;

  protected readonly form = new FormGroup({
    result: new FormControl<CloseResult>('success', { nonNullable: true }),
    failureCause: new FormControl<FailureCause | ''>('', { nonNullable: true }),
    percentComplete: new FormControl<number | null>(null, [Validators.min(0), Validators.max(100)]),
    actualMinutes: new FormControl<number | null>(null, [Validators.min(1), Validators.max(MAX_MINUTES), wholeNumber]),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(NOTE_MAX_LENGTH)] }),
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

  protected readonly gramsLegend = computed(() => {
    switch (this.result()) {
      case 'success': return 'Gramos usados por rollo';
      case 'failed': return 'Gramos desperdiciados por rollo';
      default: return 'Gramos que alcanzó a gastar por rollo';
    }
  });

  /**
   * What the fields hold from the last proposal. A field still showing it is
   * the form's to change when the result or the percentage changes; one the
   * person typed into is theirs and stays.
   */
  private proposedTime: ProposedTime | null = null;
  private proposedGrams: (number | null)[] = [];

  constructor() {
    this.form.controls.result.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.confirming.set(false);
      this.propose();
    });
    this.form.controls.percentComplete.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.propose());
  }

  ngOnInit(): void {
    const job = this.job();
    this.opened = job;
    for (const filament of job.filaments) {
      this.usage.push(createUsageRow(filament.spoolId, null));
    }
    for (const part of job.plateOutputs) {
      this.outputs.push(createOutputControl(part.unitsPerRun));
    }
    this.propose();
    void this.loadCurrentStock();
  }

  protected get usage(): FormArray<ReturnType<typeof createUsageRow>> {
    return this.form.controls.usage;
  }

  protected get outputs(): OutputControls {
    return this.form.controls.outputs;
  }

  protected filamentOf(index: number) {
    return this.opened.filaments[index]!;
  }

  /** «PETG Negro»: the code on the roll does not say what material it is. */
  protected filament(index: number): string {
    const roll = this.filamentOf(index);
    return filamentName(roll.materialCode, roll.colorName);
  }

  protected partOf(index: number) {
    return this.opened.plateOutputs[index]!;
  }

  /**
   * A cancelled job is asked the time it ran, and empty means it never ran:
   * no time, no cost (`chargedSeconds`). A finished one shows its estimate.
   */
  protected timeHint(): string | undefined {
    if (this.result() === 'cancelled') {
      return 'Lo que alcanzó a imprimir. Déjalo vacío si no llegó a empezar: sin tiempo no se cobra máquina ni luz.';
    }
    const estimate = this.opened.estimatedTimeS;
    return estimate ? `Estimado: ${duration(estimate)}` : undefined;
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

  protected noteError(): string | null {
    return this.form.controls.note.invalid ? `La nota tiene que caber en ${NOTE_MAX_LENGTH} caracteres.` : null;
  }

  protected usageError(index: number): string | null {
    const control = this.usage.at(index).controls.actualG;
    const show = control.touched || this.submitted();
    if (!show) return null;
    if (control.invalid) return GRAMS_MESSAGE;
    if (this.result() !== 'cancelled' && control.value === null) return 'Escribe cuántos gramos gastó.';
    if (this.spentWithoutTime(control.value)) return 'Sin tiempo no gastó filamento: escribe cuánto corrió o deja los gramos vacíos.';
    return null;
  }

  /** A warning, never a block: the roll's balance is theoretical until it is weighed. */
  protected overdraw(index: number): string | null {
    const grams = this.usage.at(index).controls.actualG.value;
    const left = this.current()[this.filamentOf(index).spoolId];
    if (grams === null || left === undefined || grams <= left) return null;
    return `El rollo tiene ${left} g según el kardex y quedaría en ${toHundredths(left - grams)} g. Revisa los gramos, o pésalo después.`;
  }

  protected summary(): string {
    const result = this.result();
    const grams = this.gramsText();
    if (result === 'cancelled') {
      const minutes = this.form.controls.actualMinutes.value;
      return minutes
        ? `Se cerrará como cancelada, con ${minutes} min de máquina y luz. ${grams}`
        : 'Se cerrará como cancelada, sin tiempo ni costo, y no se moverá el stock.';
    }
    if (result !== 'success' || this.opened.plateOutputs.length === 0) return grams;

    const counts = this.outputs.getRawValue().map((units, index) => ({ name: this.partOf(index).name, units: units ?? 0 }));
    return `${grams} Entran al estante: ${describeCounts(counts)}.`;
  }

  /** First step: check the form and ask for confirmation. */
  /**
   * What changed in the job since the form opened, said for a person, or
   * null while it is the job the form was made for. Started elsewhere, it
   * has rolls this form has no row for; closing it as it was seen would
   * cancel a print that is running.
   */
  protected changedSince(): string | null {
    const now = this.job();
    const opened = this.opened;
    if (!opened) return null;
    if (now.status !== opened.status) {
      return `Este trabajo cambió mientras lo cerrabas: ahora está «${JOB_STATUS_LABEL[now.status]}». Pulsa «No cerrar» y vuelve a abrirlo para cerrarlo como está ahora.`;
    }
    if (rollKey(now) !== rollKey(opened)) {
      return 'Los rollos de este trabajo cambiaron mientras lo cerrabas. Pulsa «No cerrar» y vuelve a abrirlo para escribir lo que gastó cada uno.';
    }
    return null;
  }

  protected review(): void {
    this.submitted.set(true);
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.changedSince() !== null) return;

    const result = this.result();
    const needsTime = result !== 'cancelled' && !this.form.controls.actualMinutes.value;
    const needsCause = result === 'failed' && this.form.controls.failureCause.value === '';
    const usageInvalid = this.usage.controls.some((_, index) => this.usageError(index) !== null);
    const outputsInvalid = result === 'success' && this.outputs.invalid;
    const timeInvalid = this.form.controls.actualMinutes.invalid;
    // Hidden for a successful print, which is 100 % whatever the field held.
    const percentInvalid = result !== 'success' && this.form.controls.percentComplete.invalid;
    const noteInvalid = this.form.controls.note.invalid;

    if (needsTime || needsCause || usageInvalid || outputsInvalid || timeInvalid || percentInvalid || noteInvalid) {
      this.error.set('Revisa los campos marcados antes de cerrar.');
      return;
    }
    this.confirming.set(true);
  }

  protected async confirm(): Promise<void> {
    // Before any await: a second click in the same gesture must not close twice.
    if (this.busy()) return;
    if (this.changedSince() !== null) {
      this.confirming.set(false);
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);

    try {
      const outcome = await this.data.closeJob(this.opened, {
        result: value.result,
        actualTimeS: secondsToSave(value.actualMinutes, this.proposedTime),
        usage: this.usageToSave(value.result, value.actualMinutes, value.usage),
        failureCause: value.failureCause === '' ? null : value.failureCause,
        percentComplete: value.percentComplete,
        outputs: this.opened.plateOutputs.map((part, index) => ({
          inventoryItemId: part.inventoryItemId,
          units: value.outputs[index] ?? null,
        })),
        note: value.note.trim() || null,
      });
      this.closed.emit(outcome);
    } catch (error) {
      this.confirming.set(false);
      const message = explainProductionError(error, 'No pudimos cerrar la impresión. No se movió nada; inténtalo de nuevo.');
      this.error.set(message);
      void this.workspace.afterRefusal(error);
      this.refused.emit(message);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Every roll, an empty one as zero: the job says what each one gave. A
   * cancelled print without a time never ran, and its rolls keep no figure.
   */
  private usageToSave(
    result: CloseResult,
    minutes: number | null,
    rows: { spoolId: string; actualG: number | null }[],
  ): CloseJob['usage'] {
    if (result === 'cancelled' && !minutes) return [];
    return rows.map((row) => ({ spoolId: row.spoolId, actualG: row.actualG ?? 0 }));
  }

  private spentWithoutTime(grams: number | null): boolean {
    return this.result() === 'cancelled' && !this.form.controls.actualMinutes.value && (grams ?? 0) > 0;
  }

  private gramsText(): string {
    const rows = this.usage.getRawValue();
    if (rows.length === 0) return 'No se descontará filamento: el trabajo no tiene rollos.';
    const total = toHundredths(rows.reduce((sum, row) => sum + (row.actualG ?? 0), 0));
    if (total === 0) return 'No se descontará filamento.';
    const verb = this.result() === 'success' ? 'Se descontarán' : 'Se registrarán como merma';
    const rolls = rows.length === 1 ? '1 rollo' : `${rows.length} rollos`;
    return `${verb} ${total} g de ${rolls}.`;
  }

  /** Writes the proposal for the result and percentage in the fields that still hold the last one. */
  private propose(): void {
    const job = this.opened;
    const proposal = closeProposal(
      this.result(),
      job.estimatedTimeS,
      job.filaments.map((filament) => filament.estimatedG),
      this.form.controls.percentComplete.value,
    );

    const minutes = this.form.controls.actualMinutes;
    if (minutes.value === null || minutes.value === (this.proposedTime?.minutes ?? null)) {
      minutes.setValue(proposal.time?.minutes ?? null);
    }
    // Typed minutes keep their own seconds; untouched ones, the proposal's.
    if (minutes.value === (proposal.time?.minutes ?? null)) this.proposedTime = proposal.time;

    this.usage.controls.forEach((row, index) => {
      const control = row.controls.actualG;
      if (control.value === null || control.value === (this.proposedGrams[index] ?? null)) {
        control.setValue(proposal.grams[index] ?? null);
      }
    });
    this.proposedGrams = proposal.grams;
  }

  private async loadCurrentStock(): Promise<void> {
    try {
      const rows = await this.data.stockOf(this.opened.filaments.map((f) => f.spoolId));
      this.current.set(Object.fromEntries(rows.map((row) => [row.spoolId, row.beforeG])));
    } catch {
      // The roll stock is a convenience here; closing does not depend on it.
    }
  }
}

/** The rolls of a job, in an order that does not depend on how they were read. */
function rollKey(job: JobItem): string {
  return job.filaments
    .map((filament) => filament.spoolId)
    .sort()
    .join(',');
}
