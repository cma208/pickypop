import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, Page } from '../../ui';
import { todayLocal } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { ImpresorasData } from './impresoras.data';
import { totalHours, type PrinterWorkshop } from './impresoras.models';
import { dueStatuses, needsAttention } from './maintenance-due';
import { PrinterDetail } from './printer-detail';

const HOURS = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

@Component({
  selector: 'app-impresoras.page',
  imports: [Page, AsyncState, Empty, Badge, PrinterDetail],
  styles: `
    .picker { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .picker button { display: grid; gap: 0.2rem; text-align: left; min-width: 11rem; }
    .picker button[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
    .picker small { color: var(--muted); }
  `,
  template: `
    <pp-page title="Impresoras y mantenimiento" subtitle="Horas, hora de máquina, qué toca revisar y qué ha fallado">
      <pp-async [loading]="loading()" [error]="error()">
        @if (workshop(); as data) {
          @if (data.printers.length === 0) {
            <pp-empty message="Aún no hay impresoras registradas en el taller." />
          } @else {
            @if (data.printers.length > 1) {
              <div class="picker" role="group" aria-label="Elegir impresora">
                @for (printer of data.printers; track printer.id) {
                  <button
                    type="button"
                    class="secondary"
                    [attr.aria-pressed]="printer.id === selected()?.id"
                    (click)="selectedId.set(printer.id)"
                  >
                    <strong>{{ printer.name }}</strong>
                    <small>{{ hours(printer) }} h acumuladas</small>
                    @if (attention(printer.id); as count) {
                      <pp-badge tone="warn">{{ count }} por revisar</pp-badge>
                    }
                  </button>
                }
              </div>
            }
            <!-- Keyed by printer so switching printers starts with fresh tabs and forms. -->
            @for (printer of selectedAsList(); track printer.id) {
              <app-printer-detail [printer]="printer" [workshop]="data" (changed)="reload()" />
            }
          }
        }
      </pp-async>
    </pp-page>
  `,
})
export class ImpresorasPage {
  private readonly data = inject(ImpresorasData);

  protected readonly workshop = signal<PrinterWorkshop | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);

  protected readonly selected = computed(() => {
    const printers = this.workshop()?.printers ?? [];
    return printers.find((printer) => printer.id === this.selectedId()) ?? printers[0] ?? null;
  });

  protected readonly selectedAsList = computed(() => {
    const printer = this.selected();
    return printer ? [printer] : [];
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    try {
      this.workshop.set(await this.data.load());
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar las impresoras. Inténtalo de nuevo en un momento.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected hours(printer: Parameters<typeof totalHours>[0]): string {
    return HOURS.format(totalHours(printer));
  }

  protected attention(printerId: string): number {
    const data = this.workshop();
    const printer = data?.printers.find((candidate) => candidate.id === printerId);
    if (!data || !printer) return 0;

    const plans = data.plans.filter((plan) => plan.printerId === printerId);
    const logs = data.logs.filter((log) => log.printerId === printerId);
    return needsAttention(dueStatuses(plans, logs, totalHours(printer), todayLocal())).length;
  }
}
