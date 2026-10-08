import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { PlanService, type PlanView } from '../../core/plan';
import { planWarningText, readyText } from '../../core/plan-format';
import { AsyncState, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { explainProductionError } from './production-errors';
import { PorLanzarCard } from './por-lanzar-card';
import type { QueuedRuns } from './proposal-queue-form';
import { PrintJobCard, type JobRefusal } from './print-job-card';
import { PrintJobForm } from './print-job-form';
import { ProduccionData, type CloseOutcome, type JobItem } from './produccion.data';
import { ProductionAccess } from './production-access';
import { queueLanes } from './produccion.queue';
import { rollName } from './produccion.spools';

const EFFECTS_ID = 'stock-effects';
/** Wording of the plan's warning for a printing job past its estimate (`plan-queue.ts`). */
const PAST_ESTIMATE = /pasó su tiempo estimado/;

@Component({
  selector: 'app-produccion',
  imports: [Page, Card, AsyncState, Empty, PorLanzarCard, PrintJobCard, PrintJobForm, ...FORMAT_PIPES],
  template: `
    <pp-page title="Cola de impresión" subtitle="Lo que está corriendo, lo que sigue y lo que falta producir">
      @if (canOperate()) {
        <button actions type="button" (click)="creating.set(!creating())">
          {{ creating() ? 'Cerrar formulario' : 'Nuevo trabajo' }}
        </button>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (!canOperate()) {
          <!-- A viewer reads the queue; what the database would deny is not offered (decision of the owner, 2026-10-08). -->
          <p class="muted read-only" role="status">
            Tienes acceso de solo lectura: ves la cola y el plan, pero solo el dueño y los operadores crean, ponen en cola,
            inician y cierran trabajos.
          </p>
        }

        @if (warnings().length > 0) {
          <section class="alert-warn warnings" role="status" aria-label="Avisos del plan">
            <strong>Avisos del plan</strong>
            <ul>
              @for (warning of warnings(); track warning) { <li>{{ warning }}</li> }
            </ul>
          </section>
        }

        @if (refusal(); as message) {
          <!-- The job a stale tab tried to start or close is no longer where it was: the queue says so, now reloaded. -->
          <p class="alert refusal" role="alert">
            <span>{{ message }}</span>
            <button type="button" class="ghost" (click)="refusal.set(null)">Entendido</button>
          </p>
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
                      <td>{{ rollName(row) }}</td>
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

        @if (creating() && canOperate()) {
          <app-print-job-form (saved)="onCreated()" (cancelled)="creating.set(false)" />
        }

        @if (view(); as plan) {
          <app-por-lanzar
            [view]="plan"
            [pictures]="pictures()"
            [colors]="colors()"
            [orderId]="orderId()"
            [notice]="queuedNotice()"
            (queued)="onQueued($event)"
            (dismissed)="queuedNotice.set(null)"
          />
        }

        @if (printing().length > 0) {
          <section class="group">
            <h2>Imprimiendo <span class="muted">({{ printing().length }})</span></h2>
            <div class="jobs">
              @for (job of printing(); track job.id) {
                <app-print-job-card [job]="job" (changed)="onChanged($event)" (refused)="onRefused($event)" />
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
                    <app-print-job-card [job]="job" (changed)="onChanged($event)" (refused)="onRefused($event)" />
                  </div>
                </li>
              }
            </ol>
          </section>
        }

        @if (printing().length === 0 && lanes().length === 0) {
          <pp-empty [message]="emptyMessage()">
            @if (canOperate()) {
              <button type="button" (click)="creating.set(true)">Crear un trabajo a mano</button>
            }
          </pp-empty>
        }
      </pp-async>
    </pp-page>
  `,
  styles: `
    :host ::ng-deep pp-card { margin-bottom: 1rem; }
    .warnings ul { margin: 0.35rem 0 0; padding-left: 1.2rem; overflow-wrap: anywhere; }
    .refusal { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; overflow-wrap: anywhere; }
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
    .read-only { margin: 0 0 1rem; font-size: 0.9rem; }
  `,
})
export class ProduccionPage {
  private readonly data = inject(ProduccionData);
  private readonly plan = inject(PlanService);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  protected readonly canOperate = inject(ProductionAccess).canOperate;

  /** «Ver qué falta imprimir» on an order page links here with `?pedido=<id>`. */
  protected readonly orderId = computed(() => this.query()?.get('pedido') ?? null);

  protected readonly effectsId = EFFECTS_ID;
  protected readonly rollName = rollName;

  protected readonly jobs = signal<JobItem[]>([]);
  protected readonly view = signal<PlanView | null>(null);
  protected readonly pictures = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly colors = signal<ReadonlyMap<string, string>>(new Map());
  /** Printers not retired. The plan only sees the ones that can print now. */
  private readonly printersRegistered = signal(true);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly effects = signal<CloseOutcome | null>(null);
  /** «Pusiste N corridas…», until the queue moves for another reason. */
  protected readonly queuedNotice = signal<QueuedRuns | null>(null);
  /** What the database said when it refused a stale start or close whose job then left its place. */
  protected readonly refusal = signal<string | null>(null);
  /** A refusal waiting for the reload that follows it. */
  private pendingRefusal: JobRefusal | null = null;

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
    (this.view()?.result.warnings ?? [])
      .filter((warning) => !PAST_ESTIMATE.test(warning))
      .map((warning) => planWarningText(warning, this.printersRegistered())),
  );

  protected readonly emptyMessage = computed(() => {
    if ((this.view()?.result.proposals.length ?? 0) > 0) return 'No hay nada en la cola. Pon en cola algo de «Por lanzar».';
    // The page reads every recent job, closed ones included: none at all means nothing was ever printed.
    if (this.jobs().length === 0) return 'Todavía no hay impresiones registradas.';
    return 'No hay nada en la cola. Todo lo cerrado está en el historial.';
  });

  constructor() {
    void this.load();
  }

  protected onCreated(): void {
    this.creating.set(false);
    this.queuedNotice.set(null);
    this.reload();
  }

  protected onQueued(queued: QueuedRuns): void {
    this.queuedNotice.set(queued);
    this.reload();
  }

  /** A job started or closed: what the notice said about the queue may be stale now. */
  protected onChanged(outcome: CloseOutcome | null): void {
    this.queuedNotice.set(null);
    if (outcome) {
      this.effects.set(outcome);
      setTimeout(() => document.getElementById(EFFECTS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    this.reload();
  }

  /**
   * The card already shows the refusal while the job is still where it was.
   * If the reload moves it (started elsewhere, closed elsewhere), the card it
   * was on is gone, so the page says it.
   */
  protected onRefused(refusal: JobRefusal): void {
    this.pendingRefusal = refusal;
  }

  /** Something moved the queue: the plan is computed again from a new snapshot. */
  protected reload(): void {
    this.plan.invalidate();
    void this.load();
  }

  /** Reloads quietly: the page keeps what it shows while the new data arrives. */
  private async load(): Promise<void> {
    try {
      const [jobs, view, printers] = await Promise.all([this.data.jobs(), this.plan.current(), this.data.printers()]);
      this.jobs.set(jobs);
      this.view.set(view);
      this.explainRefusal(jobs);
      this.printersRegistered.set(printers.length > 0);
      this.error.set(null);
      void this.loadPictures(view);
    } catch (error) {
      this.error.set(explainProductionError(error, 'No pudimos leer la cola ni el plan. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }

  private explainRefusal(jobs: readonly JobItem[]): void {
    const pending = this.pendingRefusal;
    if (!pending) return;
    this.pendingRefusal = null;
    const now = jobs.find((job) => job.id === pending.jobId);
    if (!now || now.status !== pending.status) this.refusal.set(pending.message);
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
