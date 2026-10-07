import { Component, computed, inject, signal } from '@angular/core';
import { PlanService, type PlanView } from '../../core/plan';
import { readyText } from '../../core/plan-format';
import { AsyncState, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { explainError } from '../pedidos/pedidos.errors';
import { PorLanzarCard } from './por-lanzar-card';
import { PrintJobCard } from './print-job-card';
import { PrintJobForm } from './print-job-form';
import { ProduccionData, type CloseOutcome, type JobItem } from './produccion.data';
import { queueLanes } from './produccion.queue';

const EFFECTS_ID = 'stock-effects';
/** Wording of the plan's warning for a printing job past its estimate (`plan-queue.ts`). */
const PAST_ESTIMATE = /pasó su tiempo estimado/;

@Component({
  selector: 'app-produccion',
  imports: [Page, Card, AsyncState, Empty, PorLanzarCard, PrintJobCard, PrintJobForm, ...FORMAT_PIPES],
  template: `
    <pp-page title="Cola de impresión" subtitle="Lo que está corriendo, lo que sigue y lo que falta producir">
      <button actions type="button" (click)="creating.set(!creating())">
        {{ creating() ? 'Cerrar formulario' : 'Nuevo trabajo' }}
      </button>

      <pp-async [loading]="loading()" [error]="error()">
        @if (warnings().length > 0) {
          <section class="alert-warn warnings" role="status" aria-label="Avisos del plan">
            <strong>Avisos del plan</strong>
            <ul>
              @for (warning of warnings(); track warning) { <li>{{ warning }}</li> }
            </ul>
          </section>
        }

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

        @if (view(); as plan) {
          <app-por-lanzar [view]="plan" [pictures]="pictures()" [colors]="colors()" (queued)="reload()" />
        }

        @if (printing().length > 0) {
          <section class="group">
            <h2>Imprimiendo <span class="muted">({{ printing().length }})</span></h2>
            <div class="jobs">
              @for (job of printing(); track job.id) {
                <app-print-job-card [job]="job" (changed)="onChanged($event)" />
              }
            </div>
          </section>
        }

        @for (lane of lanes(); track lane.printerId) {
          <section class="group">
            <h2>
              Planificado{{ lanes().length > 1 ? ' en ' + lane.printerName : '' }}
              <span class="muted">({{ lane.jobs.length }}, se imprimen en este orden)</span>
            </h2>
            <ol class="jobs">
              @for (job of lane.jobs; track job.id; let position = $index) {
                <li>
                  <span class="position" [attr.aria-label]="'Turno ' + (position + 1)">{{ position + 1 }}</span>
                  <div class="slot">
                    @if (startOf(job.id); as start) {
                      <p class="when muted">Empezaría {{ start }}</p>
                    }
                    <app-print-job-card [job]="job" (changed)="onChanged($event)" />
                  </div>
                </li>
              }
            </ol>
          </section>
        }

        @if (printing().length === 0 && lanes().length === 0) {
          <pp-empty [message]="emptyMessage()">
            <button type="button" (click)="creating.set(true)">Crear un trabajo a mano</button>
          </pp-empty>
        }
      </pp-async>
    </pp-page>
  `,
  styles: `
    :host ::ng-deep pp-card { margin-bottom: 1rem; }
    .warnings ul { margin: 0.35rem 0 0; padding-left: 1.2rem; }
    .group { margin-top: 1.5rem; }
    h2 { font-size: 1rem; margin: 0 0 0.6rem; }
    h2 .muted { font-weight: 400; }
    .jobs { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }
    .jobs li { display: flex; gap: 0.6rem; align-items: flex-start; }
    .jobs li app-print-job-card { flex: 1; min-width: 0; }
    .slot { display: grid; gap: 0.25rem; min-width: 0; flex: 1; }
    .when { margin: 0; font-size: 0.85rem; }
    .position {
      flex: none; width: 1.8rem; height: 1.8rem; margin-top: 0.9rem; border-radius: 50%;
      display: grid; place-items: center; font-size: var(--fs-sm); font-weight: 600;
      background: var(--accent-soft); color: var(--accent);
    }
    .warn-text { color: var(--warn); }
  `,
})
export class ProduccionPage {
  private readonly data = inject(ProduccionData);
  private readonly plan = inject(PlanService);

  protected readonly effectsId = EFFECTS_ID;

  protected readonly jobs = signal<JobItem[]>([]);
  protected readonly view = signal<PlanView | null>(null);
  protected readonly pictures = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly colors = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly effects = signal<CloseOutcome | null>(null);

  protected readonly printing = computed(() => this.jobs().filter((job) => job.status === 'printing'));

  /** When the plan places each queued job, in the workshop's window. */
  private readonly starts = computed(() => {
    const view = this.view();
    return new Map((view?.result.jobs ?? []).map((timing) => [timing.id, readyText(timing.start, view!.result.now)]));
  });

  protected startOf(jobId: string): string | null {
    return this.starts().get(jobId) ?? null;
  }
  /** Planned jobs per printer, in the order the plan runs them. */
  protected readonly lanes = computed(() => queueLanes(this.jobs().filter((job) => job.status === 'planned')));
  /**
   * The plan's warnings, except the one about a printing job past its
   * estimate: its card already says it, next to «Cerrar…», and this page
   * always shows the card. The plan gives warnings as text, so it is told
   * apart by its words; if they change, it shows twice rather than never.
   */
  protected readonly warnings = computed(() =>
    (this.view()?.result.warnings ?? []).filter((warning) => !PAST_ESTIMATE.test(warning)),
  );

  protected readonly emptyMessage = computed(() =>
    (this.view()?.result.proposals.length ?? 0) > 0
      ? 'No hay nada en la cola. Pon en cola algo de «Por lanzar».'
      : 'No hay nada en la cola. Todo lo cerrado está en el historial.',
  );

  constructor() {
    void this.load();
  }

  protected onCreated(): void {
    this.creating.set(false);
    this.reload();
  }

  protected onChanged(outcome: CloseOutcome | null): void {
    if (outcome) {
      this.effects.set(outcome);
      setTimeout(() => document.getElementById(EFFECTS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    this.reload();
  }

  /** Something moved the queue: the plan is computed again from a new snapshot. */
  protected reload(): void {
    this.plan.invalidate();
    void this.load();
  }

  /** Reloads quietly: the page keeps what it shows while the new data arrives. */
  private async load(): Promise<void> {
    try {
      const [jobs, view] = await Promise.all([this.data.jobs(), this.plan.current()]);
      this.jobs.set(jobs);
      this.view.set(view);
      this.error.set(null);
      void this.loadPictures(view);
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos leer la cola ni el plan. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Pictures and colours only dress the proposals: if they fail, the rows still read. */
  private async loadPictures(view: PlanView): Promise<void> {
    const proposals = view.result.proposals;
    const plateIds = proposals.flatMap((proposal) => (proposal.lineId === null && proposal.plateId ? [proposal.plateId] : []));
    const lineIds = proposals.flatMap((proposal) => (proposal.lineId ? [proposal.lineId] : []));
    const skuIds = [...new Set(proposals.flatMap((proposal) => proposal.filaments.flatMap((use) => (use.skuId ? [use.skuId] : []))))];
    try {
      const [pictures, colors] = await Promise.all([
        this.data.proposalPictures(plateIds, lineIds),
        this.data.filamentColors(skuIds),
      ]);
      this.pictures.set(pictures);
      this.colors.set(colors);
    } catch {
      // Without them each row shows its icon and a grey dot.
    }
  }
}
