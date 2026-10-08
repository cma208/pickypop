import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { wholeNumber } from '../../core/form-errors';
import type { PlanProposal } from '@pickypop/domain';
import type { PlanView } from '../../core/plan';
import { Field } from '../../ui';
import { explainProductionError } from './production-errors';
import { clampRuns, runsToQueue, type RunToQueue } from './por-lanzar';
import { ProduccionData } from './produccion.data';
import { requestKey, type SentRequest } from './request-key';
import { CurrentWorkspace } from '../../core/workspace';

/** What was queued, so the list can say it back. */
export interface QueuedRuns {
  label: string;
  runs: number;
  printerName: string;
}

/**
 * «Poner en cola»: which printer and how many of the proposed runs. The
 * person decides both (decision of the owner); the plan only proposes. Rolls
 * are not asked here: they are confirmed when each job starts.
 */
@Component({
  selector: 'app-proposal-queue-form',
  imports: [ReactiveFormsModule, Field],
  template: `
    @if (printers().length === 0) {
      <p class="error">No hay ninguna impresora activa. Activa una en Impresoras para poder encolar.</p>
      <button type="button" class="secondary" (click)="cancelled.emit()">Cerrar</button>
    } @else {
      <form [formGroup]="form" (ngSubmit)="queue()" novalidate>
        <div class="grid two">
          <pp-field label="Impresora" [required]="true">
            <select formControlName="printerId">
              @for (printer of printers(); track printer.id) {
                <option [value]="printer.id">{{ printer.name }}</option>
              }
            </select>
          </pp-field>
          <pp-field label="Corridas" [required]="true" [hint]="'De 1 a ' + proposal().runs + '.'" [error]="countError()">
            <input type="number" inputmode="numeric" min="1" [max]="proposal().runs" step="1" formControlName="count" />
          </pp-field>
        </div>
        <p class="muted small">{{ explanation() }}</p>
        @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
        <div class="row">
          <button type="submit" [disabled]="saving()">{{ saving() ? 'Poniendo en cola…' : submitText() }}</button>
          <button type="button" class="secondary" (click)="cancelled.emit()" [disabled]="saving()">Cancelar</button>
        </div>
      </form>
    }
  `,
  styles: `
    :host { display: block; margin-top: 0.75rem; padding: 0.9rem; border: 1px solid var(--line); border-radius: var(--radius); }
    .small { font-size: var(--fs-sm); margin: -0.25rem 0 0.75rem; }
  `,
})
export class ProposalQueueForm implements OnInit {
  private readonly data = inject(ProduccionData);
  private readonly workspace = inject(CurrentWorkspace);

  readonly proposal = input.required<PlanProposal>();
  readonly view = input.required<PlanView>();
  readonly queued = output<QueuedRuns>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    printerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    count: new FormControl<number | null>(null, [Validators.required, Validators.min(1), wholeNumber]),
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);
  private readonly count = toSignal(this.form.controls.count.valueChanges, { initialValue: null });
  /** The last runs sent and their key: the very same runs sent again are not queued twice. */
  private lastSent: SentRequest<{ printerId: string; runs: RunToQueue[] }> | null = null;

  /** Active printers in the plan's order: the first one comes chosen. */
  protected readonly printers = computed(() => this.view().input.printers);

  protected readonly submitText = computed(() => {
    const count = this.validCount();
    if (count === null) return 'Poner en cola';
    return count === 1 ? 'Poner 1 corrida en cola' : `Poner ${count} corridas en cola`;
  });

  protected readonly explanation = computed(() => {
    const proposal = this.proposal();
    const forWhom =
      proposal.lineId === null
        ? 'sin atarlos a un pedido: lo que salga se reparte por prioridad entre los pedidos'
        : `para la línea «${proposal.label}», que es hecha a medida`;
    return `Se crea un trabajo planificado por corrida, ${forWhom}. Los rollos se eligen al iniciar cada uno.`;
  });

  ngOnInit(): void {
    this.form.setValue({ printerId: this.printers()[0]?.id ?? '', count: this.proposal().runs });
  }

  protected countError(): string | null {
    if (!this.submitted() && this.form.controls.count.untouched) return null;
    return this.validCount() === null ? `Escribe un número entero de 1 a ${this.proposal().runs}.` : null;
  }

  protected async queue(): Promise<void> {
    // Before any await: a double click would queue every run twice.
    if (this.saving()) return;
    this.submitted.set(true);
    this.error.set(null);
    const count = this.validCount();
    const { printerId } = this.form.getRawValue();
    if (this.form.invalid || count === null) return;

    const proposal = this.proposal();
    const runs = runsToQueue(proposal, this.view(), count);
    const sent = requestKey(this.lastSent, { printerId, runs }, () => crypto.randomUUID());
    this.lastSent = sent;
    this.saving.set(true);
    try {
      await this.data.queueRuns(printerId, runs, runKeys(sent.key, runs.length));
      const printerName = this.printers().find((printer) => printer.id === printerId)?.name ?? 'la impresora';
      this.queued.emit({ label: proposal.label, runs: count, printerName });
    } catch (error) {
      this.error.set(explainProductionError(error, 'No pudimos poner las corridas en cola. Inténtalo de nuevo.'));
      void this.workspace.afterRefusal(error);
    } finally {
      this.saving.set(false);
    }
  }

  /** The count typed, if it is a whole number of runs this proposal has; null otherwise. */
  private validCount(): number | null {
    const count = this.count();
    if (count === null || !Number.isInteger(count) || count < 1) return null;
    return clampRuns(count, this.proposal()) === count ? count : null;
  }
}

/**
 * One key per run, from the key of the submission: `print_jobs.request_key`
 * is unique per job. The first run keeps the submission's key and the others
 * derive from it, so a retry of the same runs carries the same keys.
 */
export function runKeys(key: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => (index === 0 ? key : derivedKey(key, index)));
}

/** The submission's key with its last twelve hex digits shifted by the run's position: still a uuid. */
function derivedKey(key: string, index: number): string {
  const head = key.slice(0, 24);
  const tail = Number.parseInt(key.slice(24), 16);
  const shifted = ((tail + index) % 0x1000000000000).toString(16).padStart(12, '0');
  return head + shifted;
}
