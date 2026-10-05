import { Component, computed, input, output, signal } from '@angular/core';
import { Badge, Card, FORMAT_PIPES } from '../../ui';
import { todayLocal } from '../../core/dates';
import { SECTION_STYLES } from '../../core/styles';
import { ComponentsTab } from './components-tab';
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
      .tabs button { border-radius: 8px 8px 0 0; }
      .tabs button[aria-selected='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
      .count { margin-left: 0.3rem; }
    `,
  ],
  template: `
    <pp-card [heading]="printer().name">
      <pp-badge card-actions [tone]="printer().status === 'active' ? 'good' : 'neutral'">
        {{ stateLabels[printer().status] }}
      </pp-badge>

      @if (printer().model) {
        <p class="muted">{{ printer().model }}</p>
      }

      <dl class="facts">
        <div>
          <dt>Horas acumuladas</dt>
          <dd>
            {{ hours(total()) }} h
            <small>{{ hours(printer().initialHours) }} h iniciales + {{ hours(printer().workedHours) }} h de impresiones exitosas</small>
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

  protected readonly stateLabels = PRINTER_STATE_LABELS;
  protected readonly active = signal<TabId>('maintenance');

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
}
