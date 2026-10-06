import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { explainError } from '../pedidos/pedidos.errors';
import { PrintJobCard } from './print-job-card';
import { PrintJobForm } from './print-job-form';
import { RouterLink } from '@angular/router';
import { Thumb } from '../../ui';
import {
  ProduccionData,
  type CloseOutcome,
  type JobItem,
  type ProductionNeed,
} from './produccion.data';
import { JOB_STATUS_LABEL, type JobStatus } from './produccion.labels';

const EFFECTS_ID = 'stock-effects';
const QUEUE_STATUSES: JobStatus[] = ['printing', 'planned'];

interface JobGroup {
  status: JobStatus;
  jobs: JobItem[];
}

@Component({
  selector: 'app-produccion',
  imports: [Page, Card, AsyncState, Empty, Thumb, RouterLink, PrintJobCard, PrintJobForm, ...FORMAT_PIPES],
  template: `
    <pp-page title="Cola de impresión" subtitle="Lo que está corriendo, lo que sigue y lo que falta producir">
      <button actions type="button" (click)="creating.set(!creating())">
        {{ creating() ? 'Cerrar formulario' : 'Nuevo trabajo' }}
      </button>

      <pp-async [loading]="loading()" [error]="error()">
        @if (needs().length > 0) {
          <pp-card heading="Falta producir para los pedidos">
            <a card-actions routerLink="/pedidos">Ver pedidos</a>
            <p class="muted">
              Unidades comprometidas en pedidos sin entregar que todavía no están armadas. No descuenta piezas
              sueltas ni lo que ya está en la cola, así que pide de más antes que de menos.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="num">Faltan</th>
                  <th class="num hide-small">Vendidas</th>
                  <th class="num hide-small">Armadas</th>
                  <th>Primera entrega</th>
                </tr>
              </thead>
              <tbody>
                @for (need of needs(); track need.variantId) {
                  <tr>
                    <td>
                      <span class="with-thumb">
                        <pp-thumb size="lead" kind="product" [path]="need.imagePath" [name]="need.productName" />
                        <span>
                          <span class="strong">{{ need.productName }}</span>
                          <small class="sub">{{ need.variantName }} · {{ need.orderCount }} pedido(s)</small>
                        </span>
                      </span>
                    </td>
                    <td class="num"><strong>{{ need.missingUnits }}</strong></td>
                    <td class="num hide-small">{{ need.committedUnits }}</td>
                    <td class="num hide-small">{{ need.assembledUnits }}</td>
                    <td>
                      @if (need.firstDueDate) {
                        {{ need.firstDueDate | fecha }}
                      } @else {
                        <span class="muted">Sin fecha</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </pp-card>
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

        @if (queue().length === 0) {
          <pp-empty message="No hay nada en la cola. Todo lo cerrado está en el historial.">
            <button type="button" (click)="creating.set(true)">Crear un trabajo</button>
          </pp-empty>
        }

        @for (group of groups(); track group.status) {
          <section class="group">
            <h2>{{ statusLabel[group.status] }} <span class="muted">({{ group.jobs.length }})</span></h2>
            <div class="jobs">
              @for (job of group.jobs; track job.id) {
                <app-print-job-card [job]="job" (changed)="onChanged($event)" />
              }
            </div>
          </section>
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

  protected readonly jobs = signal<JobItem[]>([]);
  protected readonly needs = signal<ProductionNeed[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly effects = signal<CloseOutcome | null>(null);

  /** Lo cerrado vive en el historial: aquí solo lo que todavía da trabajo. */
  protected readonly queue = computed(() => this.jobs().filter((job) => QUEUE_STATUSES.includes(job.status)));

  protected readonly groups = computed<JobGroup[]>(() =>
    QUEUE_STATUSES.map((status) => ({
      status,
      jobs: this.queue().filter((job) => job.status === status),
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
      const [jobs, needs] = await Promise.all([this.data.jobs(), this.data.productionNeeds()]);
      this.jobs.set(jobs);
      this.needs.set(needs);
      this.error.set(null);
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos leer las impresiones. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
