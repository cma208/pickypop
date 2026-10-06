import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { date } from '../../core/format';
import { friendlyError } from '../../core/friendly-error';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { PrintJobCard } from '../produccion/print-job-card';
import { PrintJobForm, type FixedOrderLine } from '../produccion/print-job-form';
import { ProduccionData, type JobItem } from '../produccion/produccion.data';
import { PedidoCobro } from './pedido-cobro';
import { PedidosData, type OrderDetail, type OrderLine, type OrderSummary, type PaymentSummary } from './pedidos.data';
import { explainError } from './pedidos.errors';
import {
  isFinal,
  nextStatus,
  PURPOSE_LABEL,
  PURPOSE_TONE,
  STATUS_FLOW,
  STATUS_LABEL,
  STATUS_TONE,
  type OrderStatus,
} from './pedidos.labels';

@Component({
  selector: 'app-pedido',
  imports: [RouterLink, Page, Card, Badge, AsyncState, Empty, PrintJobCard, PrintJobForm, PedidoCobro, ...FORMAT_PIPES],
  template: `
    <pp-page [title]="order()?.number ?? 'Pedido'" [subtitle]="subtitle()">
      <a actions class="button secondary" routerLink="/pedidos">Volver</a>

      <pp-async [loading]="loading()" [error]="error()">
        @if (order(); as o) {
          <div class="stack">
            <pp-card heading="Datos">
              <div class="row badges">
                <pp-badge [tone]="purposeTone[o.purpose]">{{ purposeLabel[o.purpose] }}</pp-badge>
                @if (o.giftCategoryName) { <pp-badge tone="warn">{{ o.giftCategoryName }}</pp-badge> }
                <pp-badge [tone]="statusTone[o.status]">{{ statusLabel[o.status] }}</pp-badge>
              </div>
              <dl>
                @if (o.purpose === 'sale') {
                  <dt>Cliente</dt><dd>{{ o.customerName ?? '—' }}</dd>
                } @else {
                  <dt>{{ o.purpose === 'gift' ? 'Para' : 'Uso' }}</dt><dd>{{ o.recipient ?? '—' }}</dd>
                }
                <dt>Pedido</dt><dd>{{ o.orderedOn | fecha }}</dd>
                <dt>Entrega</dt><dd>{{ o.dueDate | fecha }}</dd>
                @if (o.note) { <dt>Nota</dt><dd>{{ o.note }}</dd> }
              </dl>
            </pp-card>

            @if (payment(); as p) {
              <app-pedido-cobro [orderId]="o.id" [summary]="p" [cancelled]="o.status === 'cancelled'" (collected)="reloadPayment()" />
            } @else if (paymentError(); as message) {
              <pp-card heading="Cobro"><p class="error">{{ message }}</p></pp-card>
            }

            <pp-card heading="Avance">
              <ol class="flow" aria-label="Estados del pedido">
                @for (step of flow; track step) {
                  <li [class.done]="isDone(o.status, step)" [class.current]="o.status === step">{{ statusLabel[step] }}</li>
                }
              </ol>
              @if (o.status === 'on_hold') {
                <p class="muted">El pedido está en espera. Elige en qué paso retomarlo.</p>
                <div class="row">
                  <select [value]="resumeAt()" (change)="resumeAt.set(readStatus($event))" aria-label="Retomar en">
                    @for (step of flow; track step) { <option [value]="step">{{ statusLabel[step] }}</option> }
                  </select>
                  <button type="button" (click)="change(resumeAt())" [disabled]="changing()">Retomar</button>
                </div>
              } @else if (o.status === 'cancelled') {
                <p class="muted">Este pedido fue cancelado.</p>
              } @else if (o.status === 'closed') {
                <p class="muted">Este pedido está cerrado.</p>
              }
              @if (!final(o.status) && o.status !== 'on_hold') {
                <div class="row">
                  @if (next(o.status); as step) {
                    <button type="button" (click)="change(step)" [disabled]="changing()">Pasar a {{ statusLabel[step] }}</button>
                  }
                  <button type="button" class="secondary" (click)="change('on_hold')" [disabled]="changing()">Poner en espera</button>
                  @if (confirmingCancel()) {
                    <button type="button" class="danger" (click)="change('cancelled')" [disabled]="changing()">Sí, cancelar pedido</button>
                    <button type="button" class="ghost" (click)="confirmingCancel.set(false)">No</button>
                  } @else {
                    <button type="button" class="ghost" (click)="confirmingCancel.set(true)">Cancelar pedido</button>
                  }
                </div>
              }
              @if (statusError(); as message) { <p class="error" role="alert">{{ message }}</p> }
            </pp-card>

            <pp-card heading="Líneas">
              <div class="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th><th class="num">Cant.</th>
                      @if (o.purpose === 'sale') { <th class="num">Precio</th><th class="num">Subtotal</th> }
                      <th class="num">Costo est.</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of o.lines; track line.id) {
                      <tr>
                        <td>{{ line.description }}</td>
                        <td class="num">{{ line.quantity }}</td>
                        @if (o.purpose === 'sale') {
                          <td class="num">{{ line.unitPrice | money }}</td>
                          <td class="num">{{ line.lineTotal | money }}</td>
                        }
                        <td class="num">{{ line.estimatedUnitCost * line.quantity | money }}</td>
                        <td class="num">
                          @if (!final(o.status)) {
                            <button type="button" class="secondary" (click)="startJob(line)">Crear trabajo</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th><th></th>
                      @if (o.purpose === 'sale') { <th></th><th class="num">{{ o.total | money }}</th> } 
                      <th class="num">{{ estimatedTotal() | money }}</th><th></th>
                    </tr>
                  </tfoot>
                </table>
              </div>
              @if (o.purpose !== 'sale') {
                <p class="muted note">Este pedido no lleva precio: su total es {{ 0 | money }} y el costo estimado es lo que cuesta producirlo.</p>
              }
            </pp-card>

            @if (jobLine(); as line) {
              <app-print-job-form [fixedLine]="line" (saved)="onJobSaved()" (cancelled)="jobLine.set(null)" />
            }

            <pp-card heading="Impresiones de este pedido">
              @if (jobsError(); as message) {
                <p class="error">{{ message }}</p>
              } @else if (jobs().length === 0) {
                <pp-empty message="Todavía no hay trabajos de impresión para este pedido. Crea uno desde una línea." />
              } @else {
                <div class="jobs">
                  @for (job of jobs(); track job.id) {
                    <app-print-job-card [job]="job" [showOrder]="false" (changed)="reloadProduction()" />
                  }
                </div>
              }
            </pp-card>

            <pp-card heading="Estimado contra real">
              @if (summary(); as s) {
                <div class="scroll">
                  <table>
                    <thead><tr><th></th><th class="num">Estimado</th><th class="num">Real</th><th class="num">Diferencia</th></tr></thead>
                    <tbody>
                      <tr>
                        <td>Costo de producción</td>
                        <td class="num">{{ s.estimatedCost | money }}</td>
                        <td class="num">{{ hasClosedJobs(s) ? (s.realProductionCost | money) : '—' }}</td>
                        <td class="num" [class.error]="hasClosedJobs(s) && s.realProductionCost > s.estimatedCost">
                          {{ hasClosedJobs(s) ? (s.realProductionCost - s.estimatedCost | money) : '—' }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <dl class="facts">
                  <dt>Trabajos</dt><dd>{{ s.jobs }} ({{ s.successfulJobs }} exitosos, {{ s.failedJobs }} fallidos)</dd>
                  <dt>Horas impresas</dt><dd>{{ s.printedHours }} h</dd>
                  @if (o.purpose === 'sale') {
                    <dt>Vendido por</dt><dd>{{ s.soldFor | money }}</dd>
                    @if (hasClosedJobs(s)) {
                      <dt>Ganancia real</dt><dd>{{ s.soldFor - s.realProductionCost | money }}</dd>
                    }
                  }
                </dl>
                <p class="muted note">
                  El costo real suma material, luz y máquina de las impresiones cerradas, y es parcial mientras falten por imprimir. No incluye trabajo manual ni insumos.
                  @if (!hasClosedJobs(s)) { Todavía no hay impresiones cerradas, por eso no hay costo real. }
                </p>
              } @else if (summaryError(); as message) {
                <p class="error">{{ message }}</p>
              } @else {
                <p class="muted">No hay resumen de producción para este pedido.</p>
              }
            </pp-card>
          </div>
        } @else {
          <pp-empty message="No encontramos este pedido.">
            <a class="button secondary" routerLink="/pedidos">Ir a pedidos</a>
          </pp-empty>
        }
      </pp-async>
    </pp-page>
  `,
  styles: `
    .stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
    .badges { margin-bottom: 0.75rem; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .facts { margin-top: 1rem; }
    .flow { list-style: none; display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0; margin: 0 0 1rem; }
    .flow li { padding: 0.2rem 0.6rem; border: 1px solid var(--line); border-radius: 999px; font-size: 0.8rem; color: var(--muted); }
    .flow li.done { color: var(--good); border-color: var(--good); }
    .flow li.current { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
    .scroll { overflow-x: auto; }
    .jobs { display: grid; gap: 0.6rem; }
    .note { font-size: 0.82rem; margin: 0.75rem 0 0; }
    tfoot th { font-size: 0.85rem; text-transform: none; color: inherit; }
    .row { margin-top: 0.5rem; }
    select { width: auto; }
  `,
})
export class PedidoPage {
  private readonly orders = inject(PedidosData);
  private readonly production = inject(ProduccionData);

  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  /** The `:id` of the route. */
  protected readonly id = computed(() => this.params().get('id') ?? '');

  protected readonly flow = STATUS_FLOW;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly purposeLabel = PURPOSE_LABEL;
  protected readonly purposeTone = PURPOSE_TONE;

  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly summary = signal<OrderSummary | null>(null);
  /** Null for anything that is not a sale: only sales are collected. */
  protected readonly payment = signal<PaymentSummary | null>(null);
  protected readonly jobs = signal<JobItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly summaryError = signal<string | null>(null);
  protected readonly paymentError = signal<string | null>(null);
  protected readonly jobsError = signal<string | null>(null);
  protected readonly statusError = signal<string | null>(null);
  protected readonly changing = signal(false);
  protected readonly confirmingCancel = signal(false);
  protected readonly resumeAt = signal<OrderStatus>('queued');
  protected readonly jobLine = signal<FixedOrderLine | null>(null);

  protected readonly subtitle = computed(() => {
    const order = this.order();
    return order ? `Pedido del ${date(order.orderedOn)}` : undefined;
  });

  protected readonly estimatedTotal = computed(() =>
    (this.order()?.lines ?? []).reduce((sum, line) => sum + line.estimatedUnitCost * line.quantity, 0),
  );

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected hasClosedJobs(summary: OrderSummary): boolean {
    return summary.successfulJobs + summary.failedJobs > 0;
  }

  protected final(status: OrderStatus): boolean {
    return isFinal(status);
  }

  protected next(status: OrderStatus): OrderStatus | null {
    return nextStatus(status);
  }

  protected isDone(current: OrderStatus, step: OrderStatus): boolean {
    const at = STATUS_FLOW.indexOf(current);
    return at > STATUS_FLOW.indexOf(step);
  }

  protected readStatus(event: Event): OrderStatus {
    return (event.target as HTMLSelectElement).value as OrderStatus;
  }

  protected startJob(line: OrderLine): void {
    this.jobLine.set({ id: line.id, label: `${line.description} × ${line.quantity}`, variantId: line.variantId });
  }

  protected async change(status: OrderStatus): Promise<void> {
    this.changing.set(true);
    this.statusError.set(null);
    try {
      await this.orders.setStatus(this.id(), status);
      this.confirmingCancel.set(false);
      await this.load(this.id(), false);
    } catch (error) {
      this.statusError.set(explainError(error, 'No pudimos cambiar el estado. Inténtalo de nuevo.'));
    } finally {
      this.changing.set(false);
    }
  }

  protected onJobSaved(): void {
    this.jobLine.set(null);
    void this.reloadProduction();
  }

  /** The database recomputes the status from the money, so it is read back instead of guessed. */
  protected async reloadPayment(): Promise<void> {
    await this.loadPayment(this.id());
  }

  protected async reloadProduction(): Promise<void> {
    await Promise.all([this.loadJobs(this.id()), this.loadSummary(this.id())]);
  }

  private async load(id: string, showSpinner = true): Promise<void> {
    if (showSpinner) {
      this.loading.set(true);
      this.payment.set(null);
    }
    try {
      this.order.set(await this.orders.getOrder(id));
      this.error.set(null);
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos leer este pedido. Inténtalo de nuevo.'));
      this.loading.set(false);
      return;
    }
    this.loading.set(false);
    await Promise.all([this.reloadProduction(), this.loadPayment(id)]);
  }

  private async loadJobs(id: string): Promise<void> {
    try {
      this.jobs.set(await this.production.jobsForOrder(id));
      this.jobsError.set(null);
    } catch (error) {
      this.jobsError.set(explainError(error, 'No pudimos leer las impresiones de este pedido.'));
    }
  }

  private async loadPayment(id: string): Promise<void> {
    try {
      this.payment.set(await this.orders.paymentSummary(id));
      this.paymentError.set(null);
    } catch (error) {
      this.paymentError.set(friendlyError(error, 'No pudimos leer el estado de cobro de este pedido.'));
    }
  }

  private async loadSummary(id: string): Promise<void> {
    try {
      this.summary.set(await this.orders.summary(id));
      this.summaryError.set(null);
    } catch (error) {
      this.summaryError.set(explainError(error, 'No pudimos leer el resumen de producción.'));
    }
  }
}
