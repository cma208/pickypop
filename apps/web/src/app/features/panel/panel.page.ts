import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { PlainDatePipe } from '../configuracion/shared/plain-date.pipe';
import { SECTION_STYLES } from '../configuracion/shared/styles';
import { DUE_LABELS, DUE_TONES } from '../impresoras/maintenance-due';
import { PanelData } from './panel.data';
import { FAILURE_CAUSE_LABELS, ORDER_STATUS_LABELS } from './panel.labels';

const HIGH_SUCCESS = 0.9;

const TODAY = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Lima',
});

@Component({
  selector: 'app-panel',
  imports: [RouterLink, Page, Card, Badge, Empty, AsyncState, FORMAT_PIPES, PlainDatePipe],
  styles: [
    SECTION_STYLES,
    `
      .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); }
      .row-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0; border-top: 1px solid var(--line); }
      .row-item:first-of-type { border-top: 0; }
      .row-item .grow { flex: 1; min-width: 0; }
      .row-item small { display: block; color: var(--muted); }
      .dot { width: 0.8rem; height: 0.8rem; border: 1px solid var(--line); border-radius: 50%; flex: none; }
      .big { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
      .good-text { color: var(--good); }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0.75rem 0; text-align: center; }
      .stats span { display: block; font-size: 1.1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
      .stats small { color: var(--muted); }
      .params { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; margin: 0; }
      .params dt { font-size: 0.75rem; color: var(--muted); }
      .params dd { margin: 0; font-weight: 600; }
      .positive { margin: 0; color: var(--good); }
    `,
  ],
  template: `
    <pp-page title="Resumen del día" [subtitle]="today">
      <div class="cards">
        <pp-card heading="Filamentos bajo mínimo">
          <a card-actions routerLink="/inventario/filamentos">Ver filamentos</a>
          <pp-async [loading]="low.isLoading()" [error]="problem(low.error(), 'los filamentos')">
            @if ((low.value() ?? []).length === 0) {
              <p class="positive">Todo el filamento está por encima de su mínimo.</p>
            } @else {
              @for (item of low.value(); track item.id) {
                <div class="row-item">
                  <span class="dot" [style.background]="item.colorHex ?? 'transparent'"></span>
                  <span class="grow">
                    {{ item.name }}
                    <small>Mínimo {{ item.minimumG | grams }}</small>
                  </span>
                  <pp-badge tone="bad">{{ item.availableG | grams }}</pp-badge>
                </div>
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
            @if ((maintenance.value() ?? []).length === 0) {
              <p class="positive">Sin mantenimientos pendientes: las impresoras están al día.</p>
            } @else {
              @for (alert of maintenance.value(); track alert.key) {
                <div class="row-item">
                  <span class="grow">
                    {{ alert.task }}
                    <small>{{ alert.printerName }} · {{ alert.summary }}</small>
                  </span>
                  <pp-badge [tone]="dueTones[alert.state]">{{ dueLabels[alert.state] }}</pp-badge>
                </div>
              }
            }
          </pp-async>
        </pp-card>

        <pp-card heading="Impresiones de la semana">
          <a card-actions routerLink="/produccion">Ver producción</a>
          <pp-async [loading]="prints.isLoading()" [error]="problem(prints.error(), 'las impresiones')">
            @if (prints.value(); as week) {
              @if (week.successful + week.failed === 0) {
                <p class="positive">Aún no se cerró ninguna impresión en los últimos 7 días.</p>
              } @else {
                <div class="big" [class.good-text]="isHealthy(week.successRate)">{{ week.successRate ?? 0 | percent1 }}</div>
                <p class="muted">de éxito en los últimos 7 días</p>
                <div class="stats">
                  <div><span>{{ week.successful }}</span><small>exitosas</small></div>
                  <div><span>{{ week.failed }}</span><small>fallidas</small></div>
                  <div><span>{{ week.successful + week.failed }}</span><small>cerradas</small></div>
                </div>
              }
              @if (week.historicClosed > 0) {
                <p class="muted">
                  Histórico: {{ week.historicFailureRate ?? 0 | percent1 }} de fallos en {{ week.historicClosed }} impresiones.
                  @if (week.mostCommonCause) { Causa más común: {{ causeLabels[week.mostCommonCause] }}. }
                </p>
              }
            }
          </pp-async>
        </pp-card>

        <pp-card heading="Parámetros vigentes">
          <a card-actions routerLink="/configuracion">Ver configuración</a>
          <pp-async [loading]="profile.isLoading()" [error]="problem(profile.error(), 'los parámetros')">
            @if (profile.value(); as p) {
              <p class="muted">Desde el {{ p.validFrom | fechaDia }}</p>
              <dl class="params">
                <div><dt>Margen objetivo</dt><dd>{{ p.targetMargin | percent1 }}</dd></div>
                <div><dt>Tasa de fallo</dt><dd>{{ p.failureRate | percent1 }}</dd></div>
                <div><dt>Hora de trabajo</dt><dd>{{ p.laborRatePerHour | money }}</dd></div>
                <div><dt>Luz por kWh</dt><dd>{{ p.energyRatePerKwh | money: 4 }}</dd></div>
                <div><dt>Merma</dt><dd>{{ p.materialWasteRate | percent1 }}</dd></div>
                <div><dt>IGV</dt><dd>{{ p.igvRate | percent1 }}</dd></div>
              </dl>
            } @else {
              <pp-empty message="Aún no hay parámetros vigentes. Sin ellos no se puede cotizar.">
                <a routerLink="/configuracion">Crear parámetros</a>
              </pp-empty>
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

  protected readonly low = resource({ loader: () => this.data.lowFilaments() });
  protected readonly orders = resource({ loader: () => this.data.ordersInProgress() });
  protected readonly maintenance = resource({ loader: () => this.data.maintenanceAlerts() });
  protected readonly prints = resource({ loader: () => this.data.weekPrints() });
  protected readonly profile = resource({ loader: () => this.data.currentProfile() });

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
