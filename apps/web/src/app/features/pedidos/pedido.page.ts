import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { date } from '../../core/format';
import { friendlyError } from '../../core/friendly-error';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Item, Page, ResourceHeader, type HeaderAction } from '../../ui';
import { documentTitle } from '../../core/document-title';
import { PrintJobCard, refusalAfterReload, type JobRefusal } from '../produccion/print-job-card';
import { PrintJobForm, type FixedOrderLine } from '../produccion/print-job-form';
import { ProduccionData, type JobItem } from '../produccion/produccion.data';
import { PedidoCobro } from './pedido-cobro';
import { PedidoEntrega } from './pedido-entrega';
import { PedidoEstimado } from './pedido-estimado';
import { queuedPrints } from './order-prints';
import { lineEstimate, orderEstimate } from './pedidos.delivery';
import { PedidoAvance } from './pedido-avance';
import { PedidoSituacion } from './pedido-situacion';
import { PlanService } from '../../core/plan';
import {
  PedidosData,
  type OrderDelivery,
  type OrderDetail,
  type OrderLine,
  type OrderSummary,
  type PaymentSummary,
} from './pedidos.data';
import { explainError } from './pedidos.errors';
import { isFinal, PURPOSE_LABEL, PURPOSE_TONE, STATUS_LABEL, STATUS_TONE, type OrderStatus } from './pedidos.labels';
import { CurrentWorkspace } from '../../core/workspace';

@Component({
  selector: 'app-pedido',
  imports: [
    RouterLink,
    Page,
    Card,
    Badge,
    AsyncState,
    Empty,
    Item,
    ResourceHeader,
    PrintJobCard,
    PrintJobForm,
    PedidoCobro,
    PedidoEntrega,
    PedidoEstimado,
    PedidoAvance,
    PedidoSituacion,
    ...FORMAT_PIPES,
  ],
  template: `
    <pp-page>
      <!-- The next real step (Entregar, Cobrar saldo…) goes in [action] with (acted). -->
      <pp-resource-header
        backLink="/pedidos"
        backLabel="Pedidos"
        [heading]="heading()"
        [code]="order()?.number"
        [meta]="subtitle()"
        [photo]="order() ? { kind: 'order', id: order()!.id } : null"
        [action]="primaryAction()"
        (acted)="goToDelivery()"
      >
        @if (order(); as o) {
          <pp-badge status [tone]="statusTone[o.status]">{{ statusLabel[o.status] }}</pp-badge>
        }
      </pp-resource-header>

      <pp-async [loading]="loading()" [error]="error()">
        @if (order(); as o) {
          <div class="stack">
            @if (reloadError(); as message) { <p class="alert alert-warn" role="alert">{{ message }}</p> }
            <pp-card heading="Datos">
              <div class="row badges">
                <pp-badge [tone]="purposeTone[o.purpose]">{{ purposeLabel[o.purpose] }}</pp-badge>
                @if (o.giftCategoryName) { <pp-badge tone="warn">{{ o.giftCategoryName }}</pp-badge> }
              </div>
              <dl>
                @if (o.purpose === 'sale') {
                  <dt>Cliente</dt><dd>{{ o.customerName ?? '—' }}</dd>
                } @else {
                  <dt>{{ o.purpose === 'gift' ? 'Para' : 'Uso' }}</dt><dd>{{ o.recipient ?? '—' }}</dd>
                }
                <dt>Pedido</dt><dd>{{ o.orderedOn | fecha }}</dd>
                <!-- The promise and the fact apart: «Entrega —» on a delivered order read as never delivered. -->
                <dt>Fecha comprometida</dt><dd>{{ o.dueDate ? (o.dueDate | fecha) : 'Sin fecha' }}</dd>
                @if (lastDelivery(); as last) {
                  <dt>{{ hasPending() ? 'Última entrega' : 'Entregado' }}</dt><dd>{{ last | fecha }}</dd>
                }
                @if (o.note) { <dt>Nota</dt><dd>{{ o.note }}</dd> }
              </dl>
            </pp-card>

            @if (payment(); as p) {
              <app-pedido-cobro [orderId]="o.id" [summary]="p" [cancelled]="o.status === 'cancelled'" (collected)="reloadPayment()" (stale)="onDelivered()" />
            } @else if (paymentError(); as message) {
              <pp-card heading="Cobro"><p class="error">{{ message }}</p></pp-card>
            }

            <app-pedido-avance
              [orderId]="o.id"
              [status]="o.status"
              [hasPending]="hasPending()"
              [hasDeliveries]="deliveries().length > 0"
              [paid]="payment()?.paid ?? null"
              [prints]="queued()"
              (changed)="onDelivered()"
              (deliver)="goToDelivery()"
            />

            <app-pedido-situacion [orderId]="o.id" (changed)="onDelivered()" />

            @if (hasPending() || deliveries().length > 0) {
              <app-pedido-entrega
                [orderId]="o.id"
                [lines]="o.lines"
                [deliveries]="deliveries()"
                [cancelled]="o.status === 'cancelled'"
                [balance]="payment()?.balance ?? null"
                (delivered)="onDelivered()"
                (stale)="onDelivered()"
                (collect)="goToPayment()"
              />
            }

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
                        <td>
                          <pp-item
                            size="lead"
                            kind="product"
                            [path]="line.imagePath"
                            [photo]="{ kind: 'variant', id: line.variantId }"
                            [sub]="line.variantId === null ? 'A medida' : null"
                            [name]="line.description"
                          />
                        </td>
                        <td class="num">{{ line.quantity }}</td>
                        @if (o.purpose === 'sale') {
                          <td class="num">{{ line.unitPrice | money }}</td>
                          <td class="num">{{ line.lineTotal | money }}</td>
                        }
                        <td class="num">{{ lineEstimate(line) | money }}</td>
                        <td class="num">
                          @if (!final(o.status) && line.pending > 0) {
                            @if (line.kind === 'catalog') {
                              <!-- «Por lanzar» prints for every order at once (ADR-021): a job
                                   made here would never be tied to this order anyway. -->
                              <a class="button secondary" routerLink="/produccion" [queryParams]="{ pedido: o.id }">Ver qué falta imprimir</a>
                            } @else if (line.kind === 'custom' && canOperate()) {
                              <button type="button" class="secondary" (click)="startJob(line)">Imprimir para este pedido</button>
                            }
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

            @if (canOperate() && jobLine(); as line) {
              <app-print-job-form [fixedLine]="line" (saved)="onJobSaved()" (cancelled)="jobLine.set(null)" />
            }

            @if (printsForIt()) {
              <pp-card heading="Impresiones de este pedido">
                @if (jobRefusal(); as message) {
                  <!-- The job a stale tab tried to start or close is no longer where it was: said here, now reloaded. -->
                  <p class="alert refusal" role="alert">
                    <span>{{ message }}</span>
                    <button type="button" class="ghost" (click)="jobRefusal.set(null)">Entendido</button>
                  </p>
                }
                @if (jobsError(); as message) {
                  <p class="error">{{ message }}</p>
                } @else if (jobs().length === 0) {
                  <pp-empty message="Todavía no hay impresiones para lo hecho a medida. Créalas con «Imprimir para este pedido» en su línea." />
                } @else {
                  <div class="jobs">
                    @for (job of jobs(); track job.id) {
                      <app-print-job-card [job]="job" [showOrder]="false" (changed)="reloadProduction()" (refused)="onJobRefused($event)" />
                    }
                  </div>
                }
              </pp-card>
            }

            <app-pedido-estimado
              [summary]="summary()"
              [error]="summaryError()"
              [lines]="o.lines"
              [purpose]="o.purpose"
              [cancelled]="o.status === 'cancelled'"
              [printsForIt]="printsForIt()"
            />
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
    .scroll { overflow-x: auto; }
    .jobs { display: grid; gap: 0.6rem; }
    .note { font-size: 0.82rem; margin: 0.75rem 0 0; }
    tfoot th { font-size: 0.85rem; text-transform: none; color: inherit; }
    .refusal { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; overflow-wrap: anywhere; }
  `,
})
export class PedidoPage {
  private readonly orders = inject(PedidosData);
  private readonly planner = inject(PlanService);
  private readonly production = inject(ProduccionData);
  private readonly workspace = inject(CurrentWorkspace);
  /** Owner and operator sell, deliver and collect; a viewer only reads (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;

  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  /** The `:id` of the route. */
  protected readonly id = computed(() => this.params().get('id') ?? '');

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly purposeLabel = PURPOSE_LABEL;
  protected readonly purposeTone = PURPOSE_TONE;

  private readonly delivery = viewChild(PedidoEntrega);
  private readonly collection = viewChild(PedidoCobro);

  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly deliveries = signal<OrderDelivery[]>([]);
  protected readonly summary = signal<OrderSummary | null>(null);
  /** Null for anything that is not a sale: only sales are collected. */
  protected readonly payment = signal<PaymentSummary | null>(null);
  protected readonly jobs = signal<JobItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** Reading it again after a step failed: what is on screen stays, said to be possibly out of date. */
  protected readonly reloadError = signal<string | null>(null);
  protected readonly summaryError = signal<string | null>(null);
  protected readonly paymentError = signal<string | null>(null);
  protected readonly jobsError = signal<string | null>(null);
  protected readonly jobLine = signal<FixedOrderLine | null>(null);
  /** What the database said when it refused a stale start or close whose job then left its place. */
  protected readonly jobRefusal = signal<string | null>(null);
  /** A refusal waiting for the reload that follows it. */
  private pendingRefusal: JobRefusal | null = null;

  /** The most recent time something left: deliveries come newest first. */
  protected readonly lastDelivery = computed(() => this.deliveries()[0]?.deliveredAt ?? null);

  protected readonly subtitle = computed(() => {
    const order = this.order();
    if (!order) return undefined;
    const last = this.lastDelivery();
    if (last && !this.hasPending()) return `entregado el ${date(last)}`;
    return order.dueDate ? `para el ${date(order.dueDate)}` : `pedido del ${date(order.orderedOn)}`;
  });

  /** Who it is for and what it is, before its number: "Ana Quispe · 10 × Botella de poción". */
  protected readonly heading = computed(() => {
    const order = this.order();
    if (!order) return 'Pedido';
    const party = order.purpose === 'sale' ? order.customerName : (order.recipient ?? 'Para el taller');
    return documentTitle(party, order.lines);
  });

  /** Something of the order has not left yet: "Entregado" is reached by delivering it. */
  protected readonly hasPending = computed(() => (this.order()?.lines ?? []).some((line) => line.pending > 0));

  /** What the order still has in the print queue: cancelling it has to decide about these. */
  protected readonly queued = computed(() => queuedPrints(this.jobs()));

  /** In cents, line by line, as the database adds it up: no arithmetic of money here. */
  protected readonly estimatedTotal = computed(() => orderEstimate(this.order()?.lines ?? []));
  protected readonly lineEstimate = lineEstimate;

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  /**
   * Made-to-order work is printed for this order alone, so its jobs belong
   * here. Catalogue products are printed by «Por lanzar» for every order at
   * once and never tie a job to one. Jobs already tied (older orders) stay
   * visible all the same: hiding them would hide what they cost.
   */
  protected readonly printsForIt = computed(
    () => (this.order()?.lines ?? []).some((line) => line.kind === 'custom') || this.jobs().length > 0,
  );

  protected final(status: OrderStatus): boolean {
    return isFinal(status);
  }

  /**
   * What the order is waiting for, as the one main action of the page: while
   * something is still to hand over, that is delivering it.
   */
  protected readonly primaryAction = computed<HeaderAction | null>(() => {
    const status = this.order()?.status;
    if (!this.canOperate() || !status || isFinal(status) || status === 'on_hold' || !this.hasPending()) return null;
    return { label: 'Entregar' };
  });

  protected goToDelivery(): void {
    this.delivery()?.focus();
  }

  protected goToPayment(): void {
    this.collection()?.focus();
  }

  /** The database moved the stock, the status or who goes first: read it back. */
  protected async onDelivered(): Promise<void> {
    this.planner.invalidate();
    await this.load(this.id(), false);
  }

  protected startJob(line: OrderLine): void {
    this.jobLine.set({ id: line.id, label: `${line.description} × ${line.quantity}`, variantId: line.variantId });
  }

  protected onJobSaved(): void {
    this.jobLine.set(null);
    void this.reloadProduction();
  }

  /** The database recomputes the status from the money, so it is read back instead of guessed. */
  protected async reloadPayment(): Promise<void> {
    await this.loadPayment(this.id());
  }

  /**
   * A start or a close refused: this tab is stale, as in the queue. The
   * whole order is read again (it may have been cancelled elsewhere, which
   * cancels its prints), and if the job left its place the card says nothing
   * any more, so the page says it.
   */
  protected onJobRefused(refusal: JobRefusal): void {
    this.pendingRefusal = refusal;
    void this.load(this.id(), false);
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
      const [order, deliveries] = await Promise.all([this.orders.getOrder(id), this.orders.deliveries(id)]);
      this.order.set(order);
      this.deliveries.set(deliveries);
      this.error.set(null);
      this.reloadError.set(null);
    } catch (error) {
      if (!showSpinner && this.order()?.id === id) {
        // The cards keep what the person typed and why the step failed; an
        // error page in their place would throw both away.
        this.reloadError.set(
          `${explainError(error, 'No pudimos volver a leer este pedido.')} Lo que ves puede no estar al día.`,
        );
      } else {
        this.error.set(explainError(error, 'No pudimos leer este pedido. Inténtalo de nuevo.'));
      }
      this.loading.set(false);
      return;
    }
    this.loading.set(false);
    await Promise.all([this.reloadProduction(), this.loadPayment(id)]);
  }

  private async loadJobs(id: string): Promise<void> {
    try {
      const jobs = await this.production.jobsForOrder(id);
      this.jobs.set(jobs);
      this.jobsError.set(null);
      const refused = refusalAfterReload(this.pendingRefusal, jobs);
      this.pendingRefusal = null;
      if (refused) this.jobRefusal.set(refused);
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
