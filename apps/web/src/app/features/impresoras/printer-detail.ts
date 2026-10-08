import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Badge, Card, FORMAT_PIPES } from '../../ui';
import { todayLocal } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';
import { ComponentsTab } from './components-tab';
import { ImpresorasData } from './impresoras.data';
import {
  PRINTER_STATE_LABELS,
  totalHours,
  type PrinterRecord,
  type PrinterWorkshop,
} from './impresoras.models';
import { IncidentsTab } from './incidents-tab';
import { dueStatuses, needsAttention } from './maintenance-due';
import { MaintenanceTab } from './maintenance-tab';
import { PlansTab } from './plans-tab';

type TabId = 'maintenance' | 'plans' | 'components' | 'incidents';

const HOURS = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

/** The full sheet of one printer: hours, hourly rate and the four working tabs. */
@Component({
  selector: 'app-printer-detail',
  imports: [Badge, Card, FORMAT_PIPES, MaintenanceTab, PlansTab, ComponentsTab, IncidentsTab],
  styles: [
    SECTION_STYLES,
    `
      .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; margin: 0 0 1rem; }
      .facts dt { font-size: 0.75rem; color: var(--muted); }
      .facts dd { margin: 0; font-size: 1.1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
      .facts dd small { display: block; font-size: 0.75rem; font-weight: 400; color: var(--muted); }
      .tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; margin: 1rem 0; border-bottom: 1px solid var(--line); }
      .tabs button { border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
      .tabs button[aria-selected='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
      .count { margin-left: 0.3rem; }
    `,
  ],
  template: `
    <pp-card [heading]="printer().name">
      <div card-actions class="actions">
        <pp-badge [tone]="printer().status === 'active' ? 'good' : 'neutral'">
          {{ stateLabels[printer().status] }}
        </pp-badge>
        @if (isOwner()) {
          <button type="button" class="secondary" [disabled]="busy()" (click)="edit.emit()">Editar</button>
          @if (printer().status === 'retired') {
            <button type="button" class="secondary" [disabled]="busy()" (click)="reactivate()">Reactivar</button>
          } @else {
            <button type="button" class="ghost" [disabled]="busy()" (click)="retire()">Dar de baja</button>
          }
        }
        @if (canDelete()) {
          <button type="button" class="ghost" [disabled]="busy()" (click)="remove()">Borrar</button>
        }
      </div>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (!isOwner()) {
        <p class="notice">
          @if (canOperate()) {
            La impresora, sus planes y sus componentes los cambia el dueño del taller. El mantenimiento y los incidentes
            los registras tú.
          } @else {
            Tu rol es de solo lectura: aquí ves la impresora sin registrar nada.
          }
        </p>
      }
      @if (rateGaps().length > 0) {
        <div class="notice warn" role="status">
          @for (gap of rateGaps(); track gap) {
            <p>{{ gap }}</p>
          }
          @if (isOwner()) {
            <button type="button" class="secondary" (click)="edit.emit()">Completar datos</button>
          } @else {
            <p>Pídele al dueño del taller que complete los datos.</p>
          }
        </div>
      }

      @if (printer().model) {
        <p class="muted">{{ printer().model }}</p>
      }

      <dl class="facts">
        <div>
          <dt>Horas acumuladas</dt>
          <dd>
            {{ hours(total()) }} h
            <small>{{ hours(printer().initialHours) }} h iniciales + {{ hours(printer().workedHours) }} h de impresión, fallidas incluidas</small>
          </dd>
        </div>
        <div>
          <dt>Hora de máquina</dt>
          <dd>
            {{ printer().machineRatePerHour | money: 3 }}
            <small>
              {{ printer().depreciationPerHour | money: 3 }} depreciación +
              {{ printer().maintenancePerHour | money: 3 }} mantenimiento
            </small>
          </dd>
        </div>
      </dl>

      <div class="tabs" role="tablist" aria-label="Secciones de la impresora">
        @for (tab of tabs(); track tab.id) {
          <button
            type="button"
            class="ghost"
            role="tab"
            [attr.aria-selected]="active() === tab.id"
            (click)="active.set(tab.id)"
          >
            {{ tab.label }}
            @if (tab.count > 0) {
              <pp-badge class="count" [tone]="tab.tone">{{ tab.count }}</pp-badge>
            }
          </button>
        }
      </div>

      @switch (active()) {
        @case ('maintenance') {
          <app-maintenance-tab
            [printer]="printer()"
            [currentHours]="total()"
            [plans]="plans()"
            [statuses]="statuses()"
            [logs]="logs()"
            (changed)="changed.emit()"
          />
        }
        @case ('plans') {
          <app-plans-tab [printerId]="printer().id" [plans]="allPlans()" (changed)="changed.emit()" />
        }
        @case ('components') {
          <app-components-tab
            [printerId]="printer().id"
            [currentHours]="total()"
            [components]="components()"
            (changed)="changed.emit()"
          />
        }
        @case ('incidents') {
          <app-incidents-tab [printerId]="printer().id" [incidents]="incidents()" (changed)="changed.emit()" />
        }
      }
    </pp-card>
  `,
})
export class PrinterDetail {
  readonly printer = input.required<PrinterRecord>();
  readonly workshop = input.required<PrinterWorkshop>();
  readonly changed = output<void>();
  readonly edit = output<void>();
  /** Emitted after the printer is gone, so the page stops pointing at it. */
  readonly removed = output<void>();

  private readonly data = inject(ImpresorasData);
  private readonly workspace = inject(CurrentWorkspace);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly stateLabels = PRINTER_STATE_LABELS;
  protected readonly active = signal<TabId>('maintenance');

  /** Changing the printer is configuration, the owner's; maintenance and incidents are the day to day. */
  protected readonly isOwner = this.workspace.isOwner;
  protected readonly canOperate = this.workspace.canOperate;

  /** The database lets only owners delete, and refuses a printer that has printed. */
  protected readonly canDelete = computed(() => this.isOwner() && this.printer().jobCount === 0);

  /** What makes this printer's hourly rate incomplete, said out loud rather than left as a low number. */
  protected readonly rateGaps = computed(() => {
    const printer = this.printer();
    if (printer.status === 'retired') return [];

    const gaps: string[] = [];
    if (!printer.assetId) {
      gaps.push('Esta impresora no tiene activo asociado: la hora de máquina no incluye depreciación y las cotizaciones salen más baratas de lo que son.');
    } else if (printer.depreciationPerHour <= 0) {
      gaps.push('El costo o la vida útil del activo están en 0: la hora de máquina no incluye depreciación.');
    }
    if (printer.maintenancePerHour <= 0) {
      gaps.push('Faltan el presupuesto de mantenimiento o las horas esperadas al año: la hora de máquina no incluye mantenimiento.');
    }
    return gaps;
  });

  protected readonly total = computed(() => totalHours(this.printer()));
  protected readonly allPlans = computed(() =>
    this.workshop().plans.filter((plan) => plan.printerId === this.printer().id),
  );
  /** Active plans only: the ones that are watched and offered when logging. */
  protected readonly plans = computed(() => this.allPlans().filter((plan) => plan.active));
  protected readonly logs = computed(() =>
    this.workshop().logs.filter((log) => log.printerId === this.printer().id),
  );
  protected readonly components = computed(() =>
    this.workshop().components.filter((component) => component.printerId === this.printer().id),
  );
  protected readonly incidents = computed(() =>
    this.workshop().incidents.filter((incident) => incident.printerId === this.printer().id),
  );
  protected readonly statuses = computed(() =>
    dueStatuses(this.allPlans(), this.logs(), this.total(), todayLocal()),
  );

  protected readonly tabs = computed(() => {
    const attention = needsAttention(this.statuses());
    const overdue = attention.some((status) => status.state === 'overdue');
    const openIncidents = this.incidents().filter((incident) => incident.resolvedAt === null).length;

    return [
      { id: 'maintenance' as const, label: 'Mantenimiento', count: attention.length, tone: overdue ? ('bad' as const) : ('warn' as const) },
      { id: 'plans' as const, label: 'Planes', count: 0, tone: 'neutral' as const },
      { id: 'components' as const, label: 'Componentes', count: 0, tone: 'neutral' as const },
      { id: 'incidents' as const, label: 'Incidentes', count: openIncidents, tone: 'bad' as const },
    ];
  });

  protected hours(value: number): string {
    return HOURS.format(value);
  }

  protected retire(): Promise<void> {
    const name = this.printer().name;
    const message = `¿Dar de baja «${name}»? Dejará de ofrecerse en el cotizador y su historial se conserva. Podrás reactivarla.`;
    return this.run(message, () => this.data.setPrinterStatus(this.printer().id, 'retired'), 'No pudimos dar de baja la impresora.');
  }

  protected reactivate(): Promise<void> {
    return this.run(null, () => this.data.setPrinterStatus(this.printer().id, 'active'), 'No pudimos reactivar la impresora.');
  }

  protected async remove(): Promise<void> {
    const name = this.printer().name;
    const message = `¿Borrar «${name}» para siempre? Se borran también sus planes, componentes e incidentes. Esto no se puede deshacer; si solo dejó de usarse, mejor dala de baja.`;
    await this.run(message, () => this.data.deletePrinter(this.printer()), 'No pudimos borrar la impresora.', true);
  }

  private async run(
    confirmation: string | null,
    action: () => Promise<void>,
    fallback: string,
    removes = false,
  ): Promise<void> {
    if (this.busy()) return;
    if (confirmation && !confirm(confirmation)) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      if (removes) this.removed.emit();
      this.changed.emit();
    } catch (error) {
      this.error.set(friendlyError(error, fallback));
      // A refusal may mean the role changed in another tab: read it again.
      await this.workspace.afterRefusal(error);
    } finally {
      this.busy.set(false);
    }
  }
}
