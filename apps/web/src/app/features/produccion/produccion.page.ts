import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { explainError } from '../pedidos/pedidos.errors';
import { PrintJobCard } from './print-job-card';
import { PrintJobForm } from './print-job-form';
import {
  ProduccionData,
  type CloseOutcome,
  type FailureSummary,
  type JobItem,
} from './produccion.data';
import {
  FAILURE_CAUSE_LABEL,
  JOB_STATUS_LABEL,
  JOB_STATUS_ORDER,
  type JobStatus,
} from './produccion.labels';

const EFFECTS_ID = 'stock-effects';
const ACTIVE_STATUSES: JobStatus[] = ['printing', 'planned'];

interface JobGroup {
  status: JobStatus;
  jobs: JobItem[];
  /** Closed jobs: kept folded so the queue stays the first thing you see. */
  history: boolean;
}

@Component({
  selector: 'app-produccion',
  imports: [Page, Card, AsyncState, Empty, PrintJobCard, PrintJobForm, ...FORMAT_PIPES],
  template: `
    <pp-page title="Impresiones" subtitle="La cola del taller y el cierre de cada trabajo">
      <button actions type="button" (click)="creating.set(!creating())">
        {{ creating() ? 'Cerrar formulario' : 'Nuevo trabajo' }}
      </button>

      <pp-async [loading]="loading()" [error]="error()">
        <section class="summary" aria-label="Resumen de impresiones">
          <pp-card heading="Tasa de éxito">
            @if (summary(); as stats) {
              @if (stats.failureRate !== null) {
                <p class="big">{{ 1 - stats.failureRate | percent1 }}</p>
                <p class="muted">{{ stats.closedJobs - stats.failedJobs }} de {{ stats.closedJobs }} impresiones cerradas salieron bien</p>
              } @else {
                <p class="muted">Todavía no hay impresiones cerradas.</p>
              }
            }
          </pp-card>
          <pp-card heading="Causa de fallo más común">
            @if (summary()?.mostCommonCause; as cause) {
              <p class="big small">{{ causeLabel[cause] }}</p>
              <p class="muted">{{ summary()!.failedJobs }} impresión(es) fallida(s) en total</p>
            } @else {
              <p class="muted">Sin fallos registrados.</p>
            }
          </pp-card>
        </section>

        @if (effects(); as result) {
          <pp-card heading="Stock que quedó" [id]="effectsId">
            <button card-actions type="button" class="ghost" (click)="effects.set(null)">Entendido</button>
            @if (result.warning) { <p class="warn-text">{{ result.warning }}</p> }
            @if (result.effects.length === 0) {
              <p class="muted">Esta impresión no movió stock.</p>
            } @else {
              <table>
                <thead><tr><th>Rollo</th><th class="num">Antes</th><th class="num">Ahora</th><th class="num">Cambio</th></tr></thead>
                <tbody>
                  @for (row of result.effects; track row.spoolId) {
                    <tr>
                      <td>{{ row.spoolCode }} <span class="muted">{{ row.colorName }}</span></td>
                      <td class="num">{{ row.beforeG | grams }}</td>
                      <td class="num"><strong>{{ row.afterG | grams }}</strong></td>
                      <td class="num">{{ row.afterG - row.beforeG | grams }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </pp-card>
        }

        @if (creating()) {
          <app-print-job-form (saved)="onCreated()" (cancelled)="creating.set(false)" />
        }

        @if (jobs().length === 0) {
          <pp-empty message="Todavía no hay trabajos de impresión.">
            <button type="button" (click)="creating.set(true)">Crear el primer trabajo</button>
          </pp-empty>
        }

        @for (group of groups(); track group.status) {
          @if (group.history) {
            <details class="group">
              <summary>{{ statusLabel[group.status] }} <span class="muted">({{ group.jobs.length }})</span></summary>
              <div class="jobs">
                @for (job of group.jobs; track job.id) {
                  <app-print-job-card [job]="job" (changed)="onChanged($event)" />
                }
              </div>
            </details>
          } @else {
            <section class="group">
              <h2>{{ statusLabel[group.status] }} <span class="muted">({{ group.jobs.length }})</span></h2>
              <div class="jobs">
                @for (job of group.jobs; track job.id) {
                  <app-print-job-card [job]="job" (changed)="onChanged($event)" />
                }
              </div>
            </section>
          }
        }
      </pp-async>
    </pp-page>
  `,
  styles: `
    :host ::ng-deep pp-card { margin-bottom: 1rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .summary pp-card { margin-bottom: 0; }
    .big { font-size: 1.8rem; font-weight: 600; margin: 0; line-height: 1.2; }
    .big.small { font-size: 1.15rem; }
    p { margin: 0.2rem 0; }
    .group { margin-top: 1.5rem; }
    h2 { font-size: 1rem; margin: 0 0 0.6rem; }
    .jobs { display: grid; gap: 0.6rem; }
    summary { cursor: pointer; font-weight: 600; margin-bottom: 0.6rem; }
    .warn-text { color: var(--warn); }
  `,
})
export class ProduccionPage {
  private readonly data = inject(ProduccionData);

  protected readonly effectsId = EFFECTS_ID;
  protected readonly statusLabel = JOB_STATUS_LABEL;
  protected readonly causeLabel = FAILURE_CAUSE_LABEL;

  protected readonly jobs = signal<JobItem[]>([]);
  protected readonly summary = signal<FailureSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly effects = signal<CloseOutcome | null>(null);

  protected readonly groups = computed<JobGroup[]>(() =>
    JOB_STATUS_ORDER.map((status) => ({
      status,
      jobs: this.jobs().filter((job) => job.status === status),
      history: !ACTIVE_STATUSES.includes(status),
    })).filter((group) => group.jobs.length > 0),
  );

  constructor() {
    void this.load();
  }

  protected onCreated(): void {
    this.creating.set(false);
    void this.load();
  }

  protected onChanged(outcome: CloseOutcome | null): void {
    if (outcome) {
      this.effects.set(outcome);
      setTimeout(() => document.getElementById(EFFECTS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    void this.load();
  }

  /** Reloads quietly: the page keeps what it shows while the new data arrives. */
  private async load(): Promise<void> {
    try {
      const [jobs, summary] = await Promise.all([this.data.jobs(), this.data.failureSummary()]);
      this.jobs.set(jobs);
      this.summary.set(summary);
      this.error.set(null);
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos leer las impresiones. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
