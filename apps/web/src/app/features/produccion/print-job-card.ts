import { Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { duration } from '../../core/format';
import { Badge, FORMAT_PIPES } from '../../ui';
import { explainError } from '../pedidos/pedidos.errors';
import { PrintJobClose } from './print-job-close';
import { ProduccionData, type CloseOutcome, type JobItem } from './produccion.data';
import { FAILURE_CAUSE_LABEL, isClosed, JOB_STATUS_LABEL, JOB_STATUS_TONE } from './produccion.labels';

/** One print job with its actions: start it, close it. */
@Component({
  selector: 'app-print-job-card',
  imports: [RouterLink, Badge, PrintJobClose, ...FORMAT_PIPES],
  template: `
    <article>
      <header>
        <strong>{{ title() }}</strong>
        <pp-badge [tone]="tone[job().status]">{{ statusLabel[job().status] }}</pp-badge>
      </header>

      <p class="meta muted">
        {{ job().printerName }}
        @if (job().plateLabel) { · Placa {{ job().plateLabel }} }
        · {{ timeText() }}
        @if (showOrder() && job().orderNumber) {
          · <a [routerLink]="['/pedidos', job().orderId]">{{ job().orderNumber }}</a>
        } @else if (showOrder() && !job().orderNumber) {
          · Sin pedido
        }
      </p>

      @if (job().filaments.length > 0) {
        <ul class="spools">
          @for (filament of job().filaments; track filament.id) {
            <li>
              <span class="dot" [style.background]="filament.colorHex ?? 'var(--line)'"></span>
              {{ filament.spoolCode }} · {{ filament.colorName }}:
              @if (filament.actualG !== null) {
                {{ filament.actualG | grams }} <span class="muted">(estimado {{ filament.estimatedG | grams }})</span>
              } @else {
                {{ filament.estimatedG | grams }} <span class="muted">estimado</span>
              }
            </li>
          }
        </ul>
      }

      @if (job().status === 'failed') {
        <p class="fail">
          {{ job().failureCause ? causeLabel[job().failureCause!] : 'Sin causa' }}
          @if (job().percentComplete !== null) { · completó {{ job().percentComplete }} % }
        </p>
      }
      @if (job().note) { <p class="muted note">{{ job().note }}</p> }
      @if (job().realCost !== null) { <p class="muted note">Costo real: {{ job().realCost | money }}</p> }

      @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }

      @if (!isClosed()) {
        @if (closing()) {
          <app-print-job-close [job]="job()" (closed)="onClosed($event)" (cancelled)="closing.set(false)" />
        } @else {
          <div class="row">
            @if (job().status === 'planned') {
              <button type="button" (click)="start()" [disabled]="busy()">{{ busy() ? 'Iniciando…' : 'Iniciar' }}</button>
            }
            <button type="button" class="secondary" (click)="closing.set(true)">Cerrar…</button>
          </div>
        }
      }
    </article>
  `,
  styles: `
    article { padding: 0.9rem 1rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    header { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    header strong { flex: 1; min-width: 8rem; }
    p { margin: 0.25rem 0; }
    .meta { font-size: 0.82rem; }
    .note { font-size: 0.82rem; }
    .fail { color: var(--danger); font-size: 0.85rem; }
    .spools { list-style: none; margin: 0.4rem 0 0.6rem; padding: 0; font-size: 0.85rem; display: grid; gap: 0.15rem; }
    .dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 1px solid var(--line); margin-right: 0.3rem; }
  `,
})
export class PrintJobCard {
  private readonly data = inject(ProduccionData);

  readonly job = input.required<JobItem>();
  readonly showOrder = input(true);
  /** The job changed in the database; the parent should reload. */
  readonly changed = output<CloseOutcome | null>();

  protected readonly tone = JOB_STATUS_TONE;
  protected readonly statusLabel = JOB_STATUS_LABEL;
  protected readonly causeLabel = FAILURE_CAUSE_LABEL;

  protected readonly closing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected isClosed(): boolean {
    return isClosed(this.job().status);
  }

  protected title(): string {
    const job = this.job();
    return job.label ?? job.lineDescription ?? job.plateLabel ?? 'Impresión sin nombre';
  }

  /** Real time once it exists, otherwise the estimate. */
  protected timeText(): string {
    const job = this.job();
    if (job.actualTimeS) return `${duration(job.actualTimeS)} reales`;
    return job.estimatedTimeS ? `${duration(job.estimatedTimeS)} estimados` : 'Sin tiempo estimado';
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.startJob(this.job().id);
      this.changed.emit(null);
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos iniciar la impresión. Inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected onClosed(outcome: CloseOutcome): void {
    this.closing.set(false);
    this.changed.emit(outcome);
  }
}
