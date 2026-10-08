import { Component, computed, inject, input, output, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { Card, FORMAT_PIPES } from '../../ui';
import type { QueuedPrint } from './order-prints';
import { PedidoCancelar } from './pedido-cancelar';
import { PedidoSeparo } from './pedido-separo';
import { PedidosData } from './pedidos.data';
import {
  canStopOrder,
  isFinal,
  nextStep,
  resumeTargets,
  STATUS_FLOW,
  STATUS_LABEL,
  type OrderStatus,
} from './pedidos.labels';

/**
 * Where the order is on its path and the steps it can take from there. Only
 * the steps the database accepts are offered; when it refuses anyway (someone
 * else moved the order meanwhile) its own words are shown.
 */
@Component({
  selector: 'app-pedido-avance',
  imports: [Card, PedidoCancelar, PedidoSeparo, ...FORMAT_PIPES],
  template: `
    <pp-card heading="Avance">
      <ol class="flow" aria-label="Estados del pedido">
        @for (step of flow; track step) {
          <li [class.done]="isDone(step)" [class.current]="status() === step">{{ statusLabel[step] }}</li>
        }
      </ol>
      @if (status() === 'on_hold') {
        <p class="muted">El pedido está en espera. Elige en qué paso retomarlo.</p>
        <app-pedido-separo [orderId]="orderId()" (changed)="changed.emit()" />
        <div class="row">
          <select (change)="resumeAt.set(readStatus($event))" aria-label="Retomar en">
            @for (step of resumeOptions(); track step) {
              <option [value]="step" [selected]="step === resumeAt()">{{ statusLabel[step] }}</option>
            }
          </select>
          <button type="button" (click)="change(resumeAt())" [disabled]="changing()">Retomar</button>
        </div>
      } @else if (status() === 'cancelled') {
        <p class="muted">Este pedido fue cancelado.</p>
        @if (notice(); as message) { <p class="notice" role="status">{{ message }}</p> }
      } @else if (status() === 'closed') {
        <p class="muted">Este pedido está cerrado.</p>
      }

      @if (!final() && status() !== 'on_hold') {
        <div class="row">
          @if (next(); as step) {
            @if (step.kind === 'deliver') {
              <button type="button" class="secondary" (click)="deliver.emit()">Entregar</button>
            } @else {
              <button type="button" (click)="change(step.status)" [disabled]="changing()">Pasar a {{ statusLabel[step.status] }}</button>
            }
          }
          @if (canStop()) {
            <button type="button" class="secondary" (click)="change('on_hold')" [disabled]="changing()">Poner en espera</button>
            @if (!confirmingCancel()) {
              <button type="button" class="ghost" (click)="confirmingCancel.set(true)">Cancelar pedido</button>
            }
          }
        </div>
        @if (confirmingCancel()) {
          <app-pedido-cancelar
            [orderId]="orderId()"
            [paid]="paid()"
            [prints]="prints()"
            (cancelled)="onCancelled($event)"
            (back)="confirmingCancel.set(false)"
            (stale)="printsStale.emit()"
          />
        }
      }
      @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
    </pp-card>
  `,
  styles: `
    .flow { list-style: none; display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0; margin: 0 0 1rem; }
    .flow li { padding: 0.2rem 0.6rem; border: 1px solid var(--line); border-radius: 999px; font-size: 0.8rem; color: var(--muted); }
    .flow li.done { color: var(--good); border-color: var(--good); }
    .flow li.current { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
    select { width: auto; }
    .notice { margin: 0.5rem 0 0; font-size: 0.85rem; }
  `,
})
export class PedidoAvance {
  private readonly orders = inject(PedidosData);

  readonly orderId = input.required<string>();
  readonly status = input.required<OrderStatus>();
  /** Something of the order is still to hand over. */
  readonly hasPending = input(false);
  /** Something of it already left the workshop. */
  readonly hasDeliveries = input(false);
  /** Collected and not voided; null when the order is not a sale. */
  readonly paid = input<number | null>(null);
  /** What the order still has in the print queue: cancelling decides about it. */
  readonly prints = input<QueuedPrint[]>([]);

  /** The status changed: the page reads the order again. */
  readonly changed = output<void>();
  /** What the order has in the print queue may have changed: the page reads it again. */
  readonly printsStale = output<void>();
  /** «Entregar» is the next step: the page brings the delivery form up. */
  readonly deliver = output<void>();

  protected readonly flow = STATUS_FLOW;
  protected readonly statusLabel = STATUS_LABEL;

  protected readonly changing = signal(false);
  protected readonly confirmingCancel = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resumeAt = signal<OrderStatus>('queued');
  /** Where the prints went, said once the order is cancelled. */
  protected readonly notice = signal<string | null>(null);

  protected readonly final = computed(() => isFinal(this.status()));
  protected readonly next = computed(() => nextStep(this.status(), this.hasPending()));
  protected readonly resumeOptions = computed(() => resumeTargets(this.hasPending()));
  protected readonly canStop = computed(() => canStopOrder(this.status(), this.hasDeliveries()));

  protected isDone(step: OrderStatus): boolean {
    return STATUS_FLOW.indexOf(this.status()) > STATUS_FLOW.indexOf(step);
  }

  protected readStatus(event: Event): OrderStatus {
    return (event.target as HTMLSelectElement).value as OrderStatus;
  }

  protected onCancelled(notice: string | null): void {
    this.confirmingCancel.set(false);
    this.notice.set(notice);
    this.changed.emit();
  }

  protected async change(status: OrderStatus): Promise<void> {
    this.changing.set(true);
    this.error.set(null);
    try {
      await this.orders.setStatus(this.orderId(), status);
      this.changed.emit();
    } catch (error) {
      // The database's refusals (putting on hold what already left) are
      // written for a person: they travel as they come.
      this.error.set(friendlyError(error, 'No pudimos cambiar el estado. Inténtalo de nuevo.'));
    } finally {
      this.changing.set(false);
    }
  }
}
