import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Badge, Empty, FORMAT_PIPES } from '../../ui';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';
import type { LogRecord, PlanRecord, PrinterRecord } from './impresoras.models';
import { LogForm } from './log-form';
import { DUE_LABELS, DUE_TONES, needsAttention, type DueStatus } from './maintenance-due';

const HISTORY_LIMIT = 10;

/** "What is due now" for a printer, the form to log work, and the recent history. */
@Component({
  selector: 'app-maintenance-tab',
  imports: [Badge, Empty, LogForm, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    `
      .item.overdue { border-left: 4px solid var(--danger); }
      .item.soon { border-left: 4px solid var(--warn); }
      .item.ok { border-left: 4px solid var(--good); }
      .item.never { border-left: 4px solid var(--accent); }
      h3 { margin: 1.25rem 0 0.75rem; font-size: 0.95rem; }
      details summary { cursor: pointer; font-size: 0.85rem; }
      .done { margin: 0.4rem 0 0; padding: 0; list-style: none; font-size: 0.85rem; }
      pre { margin: 0.4rem 0 0; white-space: pre-wrap; font: inherit; font-size: 0.85rem; }
    `,
  ],
  template: `
    <div class="toolbar">
      <span class="grow muted">{{ attentionSummary() }}</span>
      @if (canOperate() && !formOpen()) {
        <button type="button" (click)="openForm(null)">Registrar mantenimiento</button>
      }
    </div>

    @if (formOpen()) {
      <app-log-form
        [printerId]="printer().id"
        [currentHours]="currentHours()"
        [plans]="plans()"
        [initialPlanId]="selectedPlanId()"
        (saved)="afterSave()"
        (cancelled)="formOpen.set(false)"
      />
    }

    <h3>Qué toca ahora</h3>
    @if (statuses().length === 0) {
      <pp-empty
        [message]="isOwner() ? 'No hay planes activos. Crea uno en la pestaña «Planes».' : 'No hay planes activos. Los crea el dueño del taller en la pestaña «Planes».'"
      />
    } @else {
      <ul class="items">
        @for (status of statuses(); track status.plan.id) {
          <li class="item" [class]="'item ' + status.state">
            <header>
              <span class="title">{{ status.plan.task }}</span>
              <pp-badge [tone]="tones[status.state]">{{ labels[status.state] }}</pp-badge>
            </header>
            <p>{{ status.summary }}</p>
            <p class="muted">
              @if (status.lastDoneAt) { Última vez: {{ status.lastDoneAt | fecha }} } @else { Nunca registrado }
            </p>
            @if (canOperate()) {
              <div class="actions">
                <button type="button" [class.secondary]="status.state === 'ok'" (click)="openForm(status.plan.id)">
                  Registrar
                </button>
              </div>
            }
          </li>
        }
      </ul>
    }

    <h3>Historial reciente</h3>
    @if (history().length === 0) {
      <pp-empty message="Todavía no se registró ningún mantenimiento en esta impresora." />
    } @else {
      <ul class="items">
        @for (log of history(); track log.id) {
          <li class="item">
            <header>
              <span class="title">{{ taskName(log) }}</span>
              <span class="muted">{{ log.performedAt | fecha }}</span>
            </header>
            <p class="muted">
              {{ log.printerHours }} h en la máquina
              @if (log.durationMin !== null) { · {{ log.durationMin }} min }
              @if (log.cost > 0) { · {{ log.cost | money }} }
            </p>
            @if (log.note || log.checklistDone.length > 0) {
              <details>
                <summary>Ver detalle</summary>
                @if (log.checklistDone.length > 0) {
                  <ul class="done">
                    @for (step of log.checklistDone; track $index) {
                      <li>✔ {{ step }}</li>
                    }
                  </ul>
                }
                @if (log.note) {
                  <pre>{{ log.note }}</pre>
                }
              </details>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class MaintenanceTab {
  readonly printer = input.required<PrinterRecord>();
  readonly currentHours = input.required<number>();
  readonly plans = input.required<PlanRecord[]>();
  readonly statuses = input.required<DueStatus[]>();
  readonly logs = input.required<LogRecord[]>();
  readonly changed = output<void>();

  private readonly workspace = inject(CurrentWorkspace);
  /** Logging the work is the day to day; creating plans is the owner's. */
  protected readonly canOperate = this.workspace.canOperate;
  protected readonly isOwner = this.workspace.isOwner;
  protected readonly tones = DUE_TONES;
  protected readonly labels = DUE_LABELS;
  protected readonly formOpen = signal(false);
  protected readonly selectedPlanId = signal<string | null>(null);

  protected readonly history = computed(() => this.logs().slice(0, HISTORY_LIMIT));

  protected readonly attentionSummary = computed(() => {
    // Without a plan nothing is being watched, and "todo al día" would vouch for it.
    if (this.statuses().length === 0) return 'Sin planes de mantenimiento activos: nada vigila esta impresora.';
    const overdue = this.statuses().filter((status) => status.state === 'overdue').length;
    const attention = needsAttention(this.statuses()).length;
    if (attention === 0) return 'Sin mantenimientos pendientes: todo al día.';
    return overdue > 0
      ? `${overdue} vencido${overdue === 1 ? '' : 's'} de ${attention} que requieren atención.`
      : `${attention} próximo${attention === 1 ? '' : 's'} a vencer.`;
  });

  protected openForm(planId: string | null): void {
    this.formOpen.set(false);
    this.selectedPlanId.set(planId);
    // Re-create the form so it starts from the chosen plan and fresh hours.
    queueMicrotask(() => this.formOpen.set(true));
  }

  protected afterSave(): void {
    this.formOpen.set(false);
    this.changed.emit();
  }

  protected taskName(log: LogRecord): string {
    return this.plans().find((plan) => plan.id === log.planId)?.task ?? 'Trabajo suelto';
  }
}
