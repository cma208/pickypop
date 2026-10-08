import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState, Badge, Card, FORMAT_PIPES, Item, Page } from '../../ui';
import { SECTION_STYLES } from '../../core/styles';
import { DUE_LABELS, DUE_TONES } from '../impresoras/maintenance-due';
import { PanelData, type WeekPrints } from './panel.data';
import type { TaskUrgency } from './panel.tasks';
import { FAILURE_CAUSE_LABELS, ORDER_STATUS_LABELS } from './panel.labels';
import { firstSteps, type SetupCounts } from './panel.setup';
import { failedLabel, joinLabels } from './panel.prints';
import { maintenanceNotes } from './panel.maintenance';

type FailureCause = WeekPrints['commonCauses'][number];

const HIGH_SUCCESS = 0.9;

const URGENCY_LABELS: Record<TaskUrgency, string> = {
  late: 'Atrasado',
  today: 'Hoy',
  soon: 'Pronto',
};

const URGENCY_TONES: Record<TaskUrgency, 'bad' | 'warn' | 'info'> = {
  late: 'bad',
  today: 'warn',
  soon: 'info',
};

const TODAY = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Lima',
});

@Component({
  selector: 'app-panel',
  imports: [RouterLink, Page, Card, Badge, AsyncState, Item, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    `
      .queue { margin-bottom: 1.25rem; }
      .task { padding: 0.55rem 0; border-top: 1px solid var(--line); }
      .task:first-of-type { border-top: 0; }
      .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); }
      .row-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0; border-top: 1px solid var(--line); }
      .row-item:first-of-type { border-top: 0; }
      .row-item .grow { flex: 1; min-width: 0; }
      .row-item small { display: block; color: var(--muted); }
      .big { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
      .good-text { color: var(--good); }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0.75rem 0; text-align: center; }
      .stats span { display: block; font-size: 1.1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
      .stats small { color: var(--muted); }
      .positive { margin: 0; color: var(--good); }
      .small { font-size: var(--fs-sm); }
      .first-steps { margin-bottom: 1.25rem; }
      .first-steps ol { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.6rem; }
      .first-steps li a { font-weight: 600; }
      .first-steps li span { display: block; color: var(--muted); font-size: var(--fs-sm); }
    `,
  ],
  template: `
    <pp-page title="Hoy" [subtitle]="today">
      <a actions class="button" routerLink="/pedidos/venta-rapida">Venta rápida</a>
      @if (steps().length > 0) {
        <pp-card class="first-steps" heading="Primeros pasos">
          <p class="muted">Para que el taller pueda cotizar, planificar y vender, falta cargar:</p>
          <ol>
            @for (step of steps(); track step.key) {
              <li>
                <a [routerLink]="step.route">{{ step.title }}</a>
                <span>{{ step.why }}</span>
              </li>
            }
          </ol>
        </pp-card>
      }

      <pp-card class="queue" heading="Lo que vence">
        <pp-async [loading]="tasks.isLoading()" [error]="problem(tasks.error(), 'los pendientes')">
          @if (tasks.value()?.planFailed) {
            <p class="alert-warn" role="status">
              No pudimos calcular el plan: faltan los separos por vencer, los pedidos que llegan tarde y lo que hay
              que comprar. Recarga en un momento.
            </p>
          }
          @if ((tasks.value()?.tasks ?? []).length === 0) {
            <p class="positive">Nada vencido ni por vencer. Lo de abajo es cómo va el taller.</p>
          } @else {
            @for (task of tasks.value()?.tasks; track task.key) {
              <pp-item
                class="task"
                size="option"
                [photo]="task.photo"
                [kind]="task.kind"
                [name]="task.title"
                [link]="task.route"
                [sub]="task.detail"
              >
                <pp-badge end [tone]="urgencyTones[task.urgency]">{{ urgencyLabels[task.urgency] }}</pp-badge>
              </pp-item>
            }
          }
        </pp-async>
      </pp-card>

      <div class="cards">
        <pp-card heading="Filamentos bajo mínimo">
          <a card-actions routerLink="/inventario/filamentos">Ver filamentos</a>
          <pp-async [loading]="low.isLoading()" [error]="problem(low.error(), 'los filamentos')">
            @if ((low.value() ?? []).length === 0) {
              @if (none('filaments')) {
                <p class="muted">Todavía no hay filamentos registrados.</p>
              } @else if (!setup.isLoading()) {
                <p class="positive">Todo el filamento está por encima de su mínimo.</p>
              }
            } @else {
              @for (item of low.value(); track item.id) {
                <pp-item
                  class="row-item"
                  size="option"
                  kind="spool"
                  [color]="item.colorHex"
                  [name]="item.name"
                  [sub]="'Mínimo ' + (item.minimumG | grams)"
                >
                  <pp-badge end tone="bad">{{ item.onHandG | grams }}</pp-badge>
                </pp-item>
              }
            }
          </pp-async>
        </pp-card>

        <pp-card heading="Piezas e insumos bajo mínimo">
          <pp-async [loading]="lowItems.isLoading()" [error]="problem(lowItems.error(), 'las piezas y los insumos')">
            @if (lowItems.value(); as stock) {
              @if (stock.items.length > 0) {
                @for (item of stock.items; track item.id) {
                  <pp-item
                    class="row-item"
                    size="option"
                    [kind]="item.kind"
                    [photo]="{ kind: 'item', id: item.id }"
                    [name]="item.name"
                    [link]="item.route"
                    [sub]="item.minimumText"
                  >
                    <pp-badge end tone="bad">{{ item.onHandText }}</pp-badge>
                  </pp-item>
                }
              } @else if (stock.watched === 0) {
                <p class="muted">
                  Ninguna pieza ni insumo tiene mínimo todavía. Ponlo en su ficha, en
                  <a routerLink="/inventario/piezas">Piezas impresas</a> o <a routerLink="/inventario/insumos">Insumos</a>,
                  y aquí avisa cuando falte.
                </p>
              } @else {
                <p class="positive">Todas las piezas e insumos están sobre su mínimo.</p>
              }
            }
          </pp-async>
        </pp-card>

        <pp-card heading="Pedidos en curso">
          <a card-actions routerLink="/pedidos">Ver pedidos</a>
          <pp-async [loading]="orders.isLoading()" [error]="problem(orders.error(), 'los pedidos')">
            @if ((orders.value() ?? []).length === 0) {
              <p class="positive">Sin pedidos en curso: nada pendiente de producir ni entregar.</p>
            } @else {
              @for (row of orders.value(); track row.status) {
                <div class="row-item">
                  <span class="grow">{{ statusLabels[row.status] }}</span>
                  <pp-badge [tone]="row.status === 'on_hold' ? 'warn' : 'info'">{{ row.count }}</pp-badge>
                </div>
              }
            }
          </pp-async>
        </pp-card>

        <pp-card heading="Mantenimiento">
          <a card-actions routerLink="/impresoras">Ver impresoras</a>
          <pp-async [loading]="maintenance.isLoading()" [error]="problem(maintenance.error(), 'el mantenimiento')">
            @for (alert of maintenance.value()?.alerts; track alert.key) {
              <div class="row-item">
                <span class="grow">
                  {{ alert.task }}
                  <small>{{ alert.printerName }} · {{ alert.summary }}</small>
                </span>
                <pp-badge [tone]="dueTones[alert.state]">{{ dueLabels[alert.state] }}</pp-badge>
              </div>
            }
            @for (note of maintenanceNotes(); track note.text) {
              <p [class.positive]="note.tone === 'positive'" [class.muted]="note.tone === 'muted'">
                {{ note.text }}
                @if (note.plansLink) { Créalos en <a routerLink="/impresoras">Impresoras</a>, pestaña «Planes». }
              </p>
            }
          </pp-async>
        </pp-card>

        <pp-card heading="Impresiones de la semana">
          <a card-actions routerLink="/produccion">Ver la cola</a>
          <pp-async [loading]="prints.isLoading()" [error]="problem(prints.error(), 'las impresiones')">
            @if (prints.value(); as week) {
              @if (week.successful + week.failed === 0) {
                <p class="positive">Aún no se cerró ninguna impresión en los últimos 7 días.</p>
              } @else {
                <div class="big" [class.good-text]="isHealthy(week.successRate)">{{ week.successRate ?? 0 | percent1 }}</div>
                <p class="muted">de las impresiones de los últimos 7 días salieron bien</p>
                <!-- A cancelled print that ran is a failed attempt, as in Resultados (ADR-023, point 6). -->
                <div class="stats">
                  <div><span>{{ week.successful }}</span><small>exitosas</small></div>
                  <div><span>{{ week.failed }}</span><small>{{ failedLabel(week.cancelledRan) }}</small></div>
                  <div><span>{{ week.successful + week.failed }}</span><small>intentadas</small></div>
                </div>
              }
              @if (week.historicClosed > 0) {
                <p class="muted">
                  Histórico: fallaron {{ week.historicFailed }} de {{ week.historicClosed }} impresiones
                  ({{ week.historicFailureRate ?? 0 | percent1 }}), contando como fallidas las canceladas que
                  alcanzaron a correr.
                  @if (week.commonCauses.length === 1) {
                    Causa más común: {{ causeLabels[week.commonCauses[0]!] }}.
                  } @else if (week.commonCauses.length > 1) {
                    Ninguna causa se repite más que otra: {{ causeText(week.commonCauses) }}.
                  }
                </p>
                <!-- The price's failure reserve is a share of cost (Resultados); a count of prints is a different number. -->
                <p class="muted small">
                  Se cuenta por impresión, no por lo que costaron. La reserva por fallos de tus precios se compara por
                  costo, en <a routerLink="/finanzas/resultados">Resultados</a>.
                </p>
              }
            }
          </pp-async>
        </pp-card>

     </div>
    </pp-page>
  `,
})
export class PanelPage {
  private readonly data = inject(PanelData);

  protected readonly today = capitalize(TODAY.format(new Date()));
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly causeLabels = FAILURE_CAUSE_LABELS;
  protected readonly dueTones = DUE_TONES;
  protected readonly dueLabels = DUE_LABELS;

  protected readonly urgencyLabels = URGENCY_LABELS;
  protected readonly urgencyTones = URGENCY_TONES;

  protected readonly setup = resource({ loader: () => this.data.setupCounts() });
  /** What a new workshop still has to load. Nothing while it cannot be read: better silent than wrong. */
  protected readonly steps = computed(() => {
    const counts = this.setup.value();
    return counts ? firstSteps(counts) : [];
  });
  protected readonly tasks = resource({ loader: () => this.data.todayTasks() });
  protected readonly low = resource({ loader: () => this.data.lowFilaments() });
  protected readonly lowItems = resource({ loader: () => this.data.lowItems() });
  protected readonly orders = resource({ loader: () => this.data.ordersInProgress() });
  protected readonly maintenance = resource({ loader: () => this.data.maintenance() });
  protected readonly prints = resource({ loader: () => this.data.weekPrints() });
  protected readonly maintenanceNotes = computed(() => {
    const overview = this.maintenance.value();
    return overview ? maintenanceNotes(overview.coverage, overview.alerts.length) : [];
  });

  /** The workshop has none of these yet, so a card must not say they are fine. */
  protected none(key: keyof SetupCounts): boolean {
    return this.setup.value()?.[key] === 0;
  }

  protected readonly failedLabel = failedLabel;

  protected causeText(causes: readonly FailureCause[]): string {
    return joinLabels(causes.map((cause) => this.causeLabels[cause]));
  }

  protected isHealthy(rate: number | null): boolean {
    return (rate ?? 0) >= HIGH_SUCCESS;
  }

  /** Each block fails on its own: one broken query never blanks the whole panel. */
  protected problem(error: unknown, what: string): string | null {
    return error ? `No pudimos cargar ${what}. Inténtalo de nuevo en un momento.` : null;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
