import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PlanProposal } from '@pickypop/domain';
import type { PlanView } from '../../core/plan';
import { Badge, FORMAT_PIPES, Thumb, type PhotoRef } from '../../ui';
import {
  filamentRows,
  holdEndText,
  holdLead,
  holdsBehind,
  runsText,
  startText,
  yieldText,
  type FilamentRow,
  type HoldRef,
} from './por-lanzar';
import { ProposalQueueForm, type QueuedRuns } from './proposal-queue-form';

/**
 * One row of «Por lanzar»: the plate, how many runs and how long, the
 * filament it takes, the orders it covers in the order they get served, and
 * when it would start. Everything it says comes from the plan's result.
 */
@Component({
  selector: 'app-plan-proposal',
  imports: [RouterLink, Badge, Thumb, ProposalQueueForm, ...FORMAT_PIPES],
  template: `
    <article>
      <pp-thumb size="lead" kind="plate" [path]="picture()" [photo]="fallbackPhoto()" [name]="proposal().label" />
      <div class="body">
        <header>
          <strong>{{ proposal().label }}</strong>
          @if (!queueing()) {
            <button type="button" (click)="queueing.set(true)">Poner en cola</button>
          }
        </header>
        <p>{{ runs() }}</p>
        @if (yields(); as text) { <p class="muted small">{{ text }}</p> }

        <ul class="filaments" aria-label="Filamento que usan todas las corridas">
          @for (row of filaments(); track $index) {
            <li [class.short]="row.short">
              <span class="dot" [style.background]="colorOf(row)" aria-hidden="true"></span>
              {{ row.label }} {{ row.grams | grams }}
              @if (row.short) { <span class="sr-only">(no alcanza)</span> }
            </li>
          }
          <li>
            <pp-badge [tone]="proposal().enoughFilament ? 'good' : 'warn'">
              {{ proposal().enoughFilament ? 'Alcanza el filamento' : 'No alcanza el filamento' }}
            </pp-badge>
          </li>
        </ul>

        <p class="covers">
          <span class="muted">Cubre, en este orden: </span>
          @for (order of proposal().covers; track order.id; let last = $last) {
            <a [routerLink]="['/pedidos', order.id]">{{ order.number }}</a>
            @if (order.customerName) { <span class="muted"> ({{ order.customerName }})</span> }
            @if (!last) { <span class="sep"> · </span> }
          }
        </p>
        <p class="muted small">{{ start() }}</p>

        @if (holds().length > 0) {
          <p class="hold">
            {{ holdText() }}
            @for (hold of holds(); track hold.id; let last = $last) {
              <a [routerLink]="linkOf(hold)">{{ hold.customerName ?? hold.number }}</a>
              ({{ hold.number }}, {{ holdEnd(hold) }})@if (!last) {, }
            }.
            El taller decide si espera a que venza.
          </p>
        }

        @if (queueing()) {
          <app-proposal-queue-form
            [proposal]="proposal()"
            [view]="view()"
            (queued)="onQueued($event)"
            (cancelled)="queueing.set(false)"
          />
        }
      </div>
    </article>
  `,
  styles: `
    article { display: flex; gap: 0.9rem; align-items: flex-start; padding: 0.9rem 0; border-top: 1px solid var(--line); }
    .body { flex: 1; min-width: 0; }
    header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    header strong { flex: 1; min-width: 8rem; font-size: var(--fs-md); }
    p { margin: 0.2rem 0; }
    .small { font-size: var(--fs-sm); }
    .filaments { list-style: none; margin: 0.35rem 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.9rem; font-size: var(--fs-sm); }
    .filaments li { display: inline-flex; align-items: center; gap: 0.35rem; }
    .filaments li.short { color: var(--warn); font-weight: 600; }
    .dot { width: 0.75rem; height: 0.75rem; border-radius: 50%; border: 1px solid var(--line-strong); flex: none; }
    .covers { font-size: var(--fs-sm); }
    .sep { color: var(--muted); }
    .hold { margin-top: 0.4rem; padding: 0.45rem 0.7rem; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn); font-size: var(--fs-sm); }
    .hold a { color: inherit; font-weight: 600; }
  `,
})
export class PlanProposalRow {
  readonly proposal = input.required<PlanProposal>();
  readonly view = input.required<PlanView>();
  /** The plate thumbnail, when there is one. */
  readonly picture = input<string | null>(null);
  readonly colors = input<ReadonlyMap<string, string>>(new Map());
  readonly queued = output<QueuedRuns>();

  protected readonly queueing = signal(false);

  private readonly timeZone = computed(() => this.view().input.settings.timeZone);
  protected readonly runs = computed(() => runsText(this.proposal(), this.view().result.runs));
  protected readonly yields = computed(() => yieldText(this.proposal(), this.view().input));
  protected readonly filaments = computed(() => filamentRows(this.proposal(), this.view().result));
  protected readonly start = computed(() => startText(this.proposal(), this.view().result.now, this.timeZone()));
  protected readonly holds = computed(() => holdsBehind(this.proposal(), this.view().result, this.view().input));
  protected readonly holdText = computed(() => holdLead(this.proposal().becauseOfHolds, this.holds().length));

  /**
   * Without a plate thumbnail or a piece photo, the product its pieces go
   * into, the same last resort a job in the queue uses. Made-to-order work
   * has nothing else to show and keeps the plate icon.
   */
  protected readonly fallbackPhoto = computed<PhotoRef | null>(() => {
    const { input } = this.view();
    const plate = input.plates.find((candidate) => candidate.id === this.proposal().plateId);
    const pieces = new Set(plate?.outputs.map((output) => output.itemId) ?? []);
    const recipe = input.recipes.find((candidate) => candidate.components.some((component) => pieces.has(component.itemId)));
    return recipe ? { kind: 'variant', id: recipe.variantId } : null;
  });

  protected colorOf(row: FilamentRow): string {
    return (row.skuId ? this.colors().get(row.skuId) : null) ?? 'var(--line)';
  }

  protected holdEnd(hold: HoldRef): string {
    return holdEndText(hold.holdUntil, this.view().result.now, this.timeZone());
  }

  protected linkOf(hold: HoldRef): string[] {
    return hold.kind === 'quote' ? ['/cotizaciones', hold.id] : ['/pedidos', hold.id];
  }

  protected onQueued(queued: QueuedRuns): void {
    this.queueing.set(false);
    this.queued.emit(queued);
  }
}
