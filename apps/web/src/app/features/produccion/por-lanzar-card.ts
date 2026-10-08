import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PlanView } from '../../core/plan';
import { Card } from '../../ui';
import { hasConfirmedOrders, lateNotices, orderNumberIn, proposalKey, proposalsFor } from './por-lanzar';
import { PlanProposalRow } from './plan-proposal';
import type { QueuedRuns } from './proposal-queue-form';

/**
 * «Por lanzar» (option B, decision of the owner): orders do not push jobs
 * into the queue. Production sees what all confirmed orders still need,
 * added up and turned into plates by the plan, and a person chooses what to
 * queue, on which printer and how much of it.
 */
@Component({
  selector: 'app-por-lanzar',
  imports: [RouterLink, Card, PlanProposalRow],
  template: `
    @if (late().length > 0) {
      <div class="alert-warn late" role="status">
        <strong>Con la cola como está, {{ late().length === 1 ? 'un pedido llega tarde' : late().length + ' pedidos llegan tarde' }}:</strong>
        <ul>
          @for (notice of late(); track notice.orderId) {
            <li>
              <a [routerLink]="['/pedidos', notice.orderId]">{{ notice.number }}</a>
              @if (notice.customerName) { ({{ notice.customerName }}) }
              {{ notice.text }}.
            </li>
          }
        </ul>
        <p>Para pasar uno adelante, ábrelo y dale prioridad.</p>
      </div>
    }

    <pp-card heading="Por lanzar">
      <a card-actions routerLink="/pedidos">Ver pedidos</a>
      <p class="muted lead">
        Lo que falta imprimir para los pedidos confirmados, ya descontado lo que hay en el estante y en la cola.
        Primero lo del pedido que se confirmó antes.
      </p>

      @if (orderId(); as id) {
        <p class="filter" role="status">
          <span>Solo lo que falta para <a [routerLink]="['/pedidos', id]">{{ orderName() }}</a></span>
          <a routerLink="/produccion">Ver todo</a>
        </p>
      }

      @if (notice(); as queued) {
        <p class="done" role="status">
          {{ queued.runs === 1 ? 'Pusiste 1 corrida' : 'Pusiste ' + queued.runs + ' corridas' }} de {{ queued.label }}
          en la cola de {{ queued.printerName }}. Están abajo, en Planificado.
          <button type="button" class="ghost" (click)="dismissed.emit()">Entendido</button>
        </p>
      }

      @for (proposal of proposals(); track key(proposal)) {
        <app-plan-proposal
          [proposal]="proposal"
          [view]="view()"
          [picture]="pictures().get(key(proposal)) ?? null"
          [colors]="colors()"
          (queued)="onQueued($event)"
        />
      } @empty {
        @if (orderId()) {
          <p class="muted">Nada por lanzar para {{ orderName() }}: lo que pide ya está en el estante o en la cola, o lo cubre otro pedido antes.</p>
        } @else if (!waiting()) {
          <p class="muted">Nada por lanzar: no hay pedidos confirmados esperando piezas.</p>
        } @else {
          <p class="muted">Nada por lanzar: lo que piden los pedidos confirmados ya está en el estante o en la cola.</p>
        }
      }
    </pp-card>
  `,
  styles: `
    .late ul { margin: 0.35rem 0; padding-left: 1.2rem; }
    .late p { margin: 0; font-size: var(--fs-sm); }
    .late a { color: inherit; font-weight: 600; }
    .lead { margin: -0.4rem 0 0.4rem; font-size: var(--fs-sm); }
    .filter {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;
      margin: 0.5rem 0; padding: 0.5rem 0.8rem; border-radius: var(--radius-sm); background: var(--info-soft); color: var(--info);
    }
    .filter a { color: inherit; font-weight: 600; }
    .done { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; padding: 0.5rem 0.8rem; border-radius: var(--radius-sm); background: var(--good-soft); color: var(--good); }
  `,
})
export class PorLanzarCard {
  readonly view = input.required<PlanView>();
  /** Plate thumbnails, keyed like the proposals. */
  readonly pictures = input<ReadonlyMap<string, string>>(new Map());
  readonly colors = input<ReadonlyMap<string, string>>(new Map());
  /** Set when the order page asked «Ver qué falta imprimir»: only what that order is waiting for. */
  readonly orderId = input<string | null>(null);
  /**
   * What was just put in the queue. The page keeps it, because only the page
   * sees the queue move afterwards: once a job starts or closes, "están
   * abajo, en Planificado" is no longer true and the page takes it away.
   */
  readonly notice = input<QueuedRuns | null>(null);
  /** Jobs were created: the page has to read the queue and the plan again. */
  readonly queued = output<QueuedRuns>();
  readonly dismissed = output<void>();

  protected readonly key = proposalKey;
  protected readonly waiting = computed(() => hasConfirmedOrders(this.view().result));

  protected readonly proposals = computed(() => proposalsFor(this.view().result.proposals, this.orderId()));
  protected readonly orderName = computed(() => {
    const id = this.orderId();
    return id === null ? '' : (orderNumberIn(this.view().result, id) ?? 'este pedido');
  });
  protected readonly late = computed(() => lateNotices(this.view().result, this.view().input.settings.timeZone));

  protected onQueued(queued: QueuedRuns): void {
    this.queued.emit(queued);
  }
}
