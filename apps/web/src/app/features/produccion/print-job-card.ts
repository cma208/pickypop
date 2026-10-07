import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { duration } from '../../core/format';
import { Badge, FORMAT_PIPES, Thumb } from '../../ui';
import { explainError } from '../pedidos/pedidos.errors';
import { PrintJobClose } from './print-job-close';
import { ProduccionData, type CloseOutcome, type JobItem } from './produccion.data';
import { FAILURE_CAUSE_LABEL, isClosed, JOB_STATUS_LABEL, JOB_STATUS_TONE } from './produccion.labels';
import { jobProgress } from './produccion.progress';
import { plannedCounts, type PartCount } from './produccion.outputs';

/** One print job with its actions: start it, close it. */
@Component({
  selector: 'app-print-job-card',
  imports: [RouterLink, Badge, Thumb, DecimalPipe, PrintJobClose, ...FORMAT_PIPES],
  template: `
    <article>
      <div class="top">
        <!-- What goes on the bed: 96 px while it prints, smaller in the queue and in the history. -->
        <pp-thumb
          [size]="job().status === 'printing' ? 'bed' : isClosed() ? 'row' : 'lead'"
          [photo]="{ kind: 'job', id: job().id }"
          [name]="title()"
        />
        <div class="summary">
      <header>
        @if (job().plateId) {
          <pp-thumb size="lg" [path]="job().plateThumbnailPath" [name]="job().plateLabel ?? title()" />
        }
        <strong>{{ title() }}</strong>
        <pp-badge [tone]="tone[job().status]">{{ statusLabel[job().status] }}</pp-badge>
      </header>

      <p class="meta muted">
        @if (isClosed() && (job().finishedAt ?? job().startedAt); as when) { {{ when | fecha }} · }
        {{ job().printerName }}
        @if (job().plateLabel) { · Placa {{ job().plateLabel }} }
        · {{ timeText() }}
        @if (showOrder() && job().orderNumber) {
          · <a [routerLink]="['/pedidos', job().orderId]">{{ job().orderNumber }}</a>
        } @else if (showOrder() && !job().orderNumber) {
          · Sin pedido
        }
      </p>

      @if (progress(); as run) {
        <div class="progress" role="group" [attr.aria-label]="'Avance de la impresión'">
          @if (run.fraction !== null) {
            <div class="bar"><span [style.width.%]="run.fraction * 100" [class.late]="run.overdue"></span></div>
            <p class="muted small">
              {{ run.fraction * 100 | number: '1.0-0' }} %
              @if (run.overdue) {
                · va {{ -run.remainingS! | duration }} más de lo estimado
              } @else {
                · faltan {{ run.remainingS! | duration }}
              }
            </p>
          } @else {
            <p class="muted small">Lleva {{ run.elapsedS | duration }}. Sin estimación para comparar.</p>
          }
        </div>
      }
        </div>
      </div>

      @if (shelf(); as line) {
        <div class="shelf">
          <span class="muted">{{ line.lead }}</span>
          @for (part of line.parts; track part.inventoryItemId) {
            <span class="part"><pp-thumb size="sm" [path]="part.imagePath" [name]="part.name" /> {{ part.units | number: '1.0-3' }} {{ part.name }}</span>
          }
        </div>
      }

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
    .top { display: flex; align-items: flex-start; gap: 0.9rem; }
    .summary { flex: 1; min-width: 0; }
    .progress { margin: 0.5rem 0 0.2rem; }
    .bar { height: 0.45rem; border-radius: 999px; background: var(--line); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--info); transition: width 0.3s; }
    .bar span.late { background: var(--warn); }
    .small { font-size: 0.8rem; margin: 0.25rem 0 0; }
    header { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    header strong { flex: 1; min-width: 8rem; }
    p { margin: 0.25rem 0; }
    .meta { font-size: 0.82rem; }
    .note { font-size: 0.82rem; }
    .fail { color: var(--danger); font-size: 0.85rem; }
    .spools { list-style: none; margin: 0.4rem 0 0.6rem; padding: 0; font-size: 0.85rem; display: grid; gap: 0.15rem; }
    .shelf { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.75rem; margin: 0.4rem 0; font-size: 0.85rem; }
    .part { display: inline-flex; align-items: center; gap: 0.35rem; }
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

  /**
   * Only while it runs: once it is closed the real time is what counts, and a
   * bar that keeps filling after the fact would be telling a story.
   */
  protected readonly progress = computed(() =>
    this.job().status === 'printing' ? jobProgress(this.job().startedAt, this.job().estimatedTimeS) : null,
  );
  protected readonly error = signal<string | null>(null);

  /**
   * What this job puts on the shelf, part by part: the plan while it is
   * pending, what really went in once it closed well. Never a single total,
   * which on a plate of caps and bodies would add up things that do not add.
   */
  protected readonly shelf = computed<{ lead: string; parts: PartCount[] } | null>(() => {
    const job = this.job();
    if (job.status === 'success') {
      if (job.produced.length > 0) return { lead: 'Entró al estante:', parts: job.produced };
      // A job closed before the shelf existed has units but no movements, and
      // saying "nothing went in" would read as a fault. Only a close that
      // really counted zero gets to say so.
      const countedZero = job.unitsProduced === 0 && job.plateOutputs.length > 0;
      return countedZero ? { lead: 'No entró ninguna pieza al estante.', parts: [] } : null;
    }
    if (isClosed(job.status) || job.plateOutputs.length === 0) return null;
    return { lead: 'Una corrida completa deja:', parts: plannedCounts(job.plateOutputs) };
  });

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
