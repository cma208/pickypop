import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Empty, FORMAT_PIPES, Page } from '../../ui';
import { explainProductionError } from './production-errors';
import { PrintJobCard } from './print-job-card';
import { ProduccionData, type JobItem } from './produccion.data';
import { JOB_STATUS_LABEL, type JobStatus } from './produccion.labels';

const CLOSED_STATUSES: JobStatus[] = ['success', 'failed', 'cancelled'];

/**
 * Lo que ya pasó.
 *
 * Vivía debajo de la cola, plegado. Son dos preguntas distintas —*¿qué hago
 * ahora?* y *¿qué pasó?*— y mezclarlas obliga a leer la primera esquivando la
 * segunda. Aquí el orden es por fecha y lo último está arriba, que es como se
 * busca algo que ya ocurrió.
 */
@Component({
  selector: 'app-historial-impresiones',
  imports: [Page, AsyncState, Empty, PrintJobCard, ...FORMAT_PIPES],
  template: `
    <pp-page title="Historial de impresiones" subtitle="Lo cerrado, con su resultado y su costo real">
      <pp-async [loading]="loading()" [error]="error()">
        <div class="toolbar">
          <label class="filter">
            Resultado
            <select [value]="filter()" (change)="onFilter($event)">
              <option value="">Todos</option>
              @for (status of statuses; track status) {
                <option [value]="status">{{ statusLabel[status] }}</option>
              }
            </select>
          </label>
          <span class="muted">{{ visible().length }} de {{ closed().length }}</span>
        </div>

        @if (closed().length === 0) {
          <pp-empty message="Todavía no hay impresiones cerradas." />
        } @else if (visible().length === 0) {
          <pp-empty message="Ninguna impresión coincide con el filtro." />
        } @else {
          <div class="jobs">
            @for (job of visible(); track job.id) {
              <app-print-job-card [job]="job" (changed)="reload()" />
            }
          </div>
        }
      </pp-async>
    </pp-page>
  `,
  styles: `
    .toolbar { display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .filter { display: grid; gap: 0.25rem; font-size: 0.85rem; }
    .jobs { display: grid; gap: 0.6rem; }
  `,
})
export class HistorialPage {
  private readonly data = inject(ProduccionData);

  protected readonly statuses = CLOSED_STATUSES;
  protected readonly statusLabel = JOB_STATUS_LABEL;

  protected readonly jobs = signal<JobItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<JobStatus | ''>('');

  protected readonly closed = computed(() => this.jobs().filter((job) => CLOSED_STATUSES.includes(job.status)));

  protected readonly visible = computed(() => {
    const status = this.filter();
    return status ? this.closed().filter((job) => job.status === status) : this.closed();
  });

  constructor() {
    void this.load();
  }

  protected onFilter(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as JobStatus | '');
  }

  protected reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.jobs.set(await this.data.jobs());
      this.error.set(null);
    } catch (error) {
      this.error.set(explainProductionError(error, 'No pudimos leer el historial. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
