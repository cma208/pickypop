import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, Page } from '../../ui';
import { todayLocal } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { CurrentWorkspace } from '../../core/workspace';
import { ImpresorasData } from './impresoras.data';
import { totalHours, type PrinterRecord, type PrinterWorkshop } from './impresoras.models';
import { dueStatuses, needsAttention } from './maintenance-due';
import { PrinterDetail } from './printer-detail';
import { PrinterForm } from './printer-form';

const HOURS = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

@Component({
  selector: 'app-impresoras.page',
  imports: [Page, AsyncState, Empty, Badge, PrinterDetail, PrinterForm],
  styles: `
    .picker { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .picker button { display: grid; gap: 0.2rem; text-align: left; min-width: 11rem; }
    .picker button[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
    .picker small { color: var(--muted); }
  `,
  template: `
    <pp-page title="Impresoras y mantenimiento" subtitle="Horas, hora de máquina, qué toca revisar y qué ha fallado">
      @if (workshop() && isOwner()) {
        <button actions type="button" [hidden]="formOpen()" (click)="openForm(null)">Nueva impresora</button>
      }
      <pp-async [loading]="loading()" [error]="error()">
        @if (workshop(); as data) {
          <!-- Keyed by what is being edited, so reopening the form never shows the previous values. -->
          @if (formOpen()) {
            @for (target of formTargets(); track target?.id ?? 'new') {
              <app-printer-form [printer]="target" (saved)="afterSave($event)" (cancelled)="formOpen.set(false)" />
            }
          }
          @if (data.printers.length === 0) {
            @if (!formOpen()) {
              @if (isOwner()) {
                <pp-empty message="Aún no hay impresoras registradas en el taller. Registra la primera para poder calcular la hora de máquina de las cotizaciones.">
                  <button type="button" (click)="openForm(null)">Registrar la primera impresora</button>
                </pp-empty>
              } @else {
                <pp-empty message="Aún no hay impresoras registradas en el taller. Las registra el dueño del taller." />
              }
            }
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
                    @if (printer.status === 'retired') {
                      <pp-badge>Retirada</pp-badge>
                    }
                    @if (attention(printer.id); as count) {
                      <pp-badge tone="warn">{{ count }} por revisar</pp-badge>
                    }
                  </button>
                }
              </div>
            }
            <!-- Keyed by printer so switching printers starts with fresh tabs and forms. -->
            @for (printer of selectedAsList(); track printer.id) {
              <app-printer-detail
                [printer]="printer"
                [workshop]="data"
                (changed)="reload()"
                (edit)="openForm(printer)"
                (removed)="selectedId.set(null)"
              />
            }
          }
        }
      </pp-async>
    </pp-page>
  `,
})
export class ImpresorasPage {
  private readonly data = inject(ImpresorasData);
  private readonly workspace = inject(CurrentWorkspace);

  protected readonly workshop = signal<PrinterWorkshop | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  /** Registering and changing printers is configuration: the owner's (ADR-025). */
  protected readonly isOwner = this.workspace.isOwner;

  protected readonly formOpen = signal(false);
  /** Null inside the list means "a new printer"; a record means editing it. */
  private readonly editing = signal<PrinterRecord | null>(null);
  protected readonly formTargets = computed(() => [this.editing()]);

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

  protected openForm(printer: PrinterRecord | null): void {
    this.editing.set(printer);
    this.formOpen.set(true);
  }

  protected async afterSave(printerId: string): Promise<void> {
    this.formOpen.set(false);
    this.selectedId.set(printerId);
    await this.reload();
  }

  protected async reload(): Promise<void> {
    try {
      // The delete button depends on the role, which loads with the workshop.
      await this.workspace.info();
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
