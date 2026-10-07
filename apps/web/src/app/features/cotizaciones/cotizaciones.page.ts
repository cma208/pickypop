import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { todayLocal } from '../../core/dates';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page, type BadgeTone } from '../../ui';
import {
  CotizadorData,
  DataError,
  QUOTE_STATUS_LABELS,
  type QuoteStatus,
  type QuoteSummary,
} from '../cotizador/cotizador.data';

type Filter = QuoteStatus | 'all' | 'overdue';

const TONES: Record<QuoteStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'good',
  rejected: 'bad',
  expired: 'warn',
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'sent', label: 'Enviadas' },
  { value: 'accepted', label: 'Aceptadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'overdue', label: 'Vencidas' },
];

/** A quote is past its date when it had one and it already went by. */
function isOverdue(quote: QuoteSummary, today: string): boolean {
  if (quote.validUntil === null) return false;
  if (quote.status === 'accepted' || quote.status === 'rejected') return false;

  return quote.validUntil < today;
}

@Component({
  selector: 'app-cotizaciones',
  imports: [RouterLink, Page, Card, Badge, AsyncState, Empty, ...FORMAT_PIPES],
  template: `
    <pp-page title="Cotizaciones" subtitle="Lo que se ha presupuestado y en qué quedó">
      <div actions>
        <a class="button" routerLink="/cotizador">+ Nueva cotización</a>
      </div>

      <pp-async [loading]="loading()" [error]="error()">
        <pp-card>
          <div class="row filters" role="group" aria-label="Filtrar por estado">
            @for (option of filters; track option.value) {
              <button
                type="button"
                [class.secondary]="filter() !== option.value"
                [attr.aria-pressed]="filter() === option.value"
                (click)="filter.set(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>

          @if (visible().length === 0) {
            <pp-empty
              [message]="
                quotes().length === 0
                  ? 'Todavía no hay cotizaciones. Arma la primera en el cotizador.'
                  : 'Ninguna cotización coincide con ese filtro.'
              "
            >
              <a class="button" routerLink="/cotizador">Ir al cotizador</a>
            </pp-empty>
          } @else {
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Vigencia</th>
                  <th class="num">Total</th>
                </tr>
              </thead>
              <tbody>
                @for (quote of visible(); track quote.id) {
                  <tr [class.overdue]="overdue(quote)">
                    <td>
                      <a [routerLink]="['/cotizaciones', quote.id]">{{ quote.number }}</a>
                      @if (quote.version > 1) {
                        <small class="muted">v{{ quote.version }}</small>
                      }
                      @if (quote.hasNewerVersion) {
                        <small class="muted">hay una versión más nueva</small>
                      }
                    </td>
                    <td>{{ quote.customerName ?? '—' }}</td>
                    <td><pp-badge [tone]="tone(quote)">{{ label(quote) }}</pp-badge></td>
                    <td>
                      @if (quote.validUntil) {
                        <span [class.error]="overdue(quote)">{{ quote.validUntil | fecha }}</span>
                      } @else {
                        <span class="muted">sin fecha</span>
                      }
                    </td>
                    <td class="num">{{ quote.total | money }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </pp-card>
      </pp-async>
    </pp-page>
  `,
  styles: `
    :host { display: block; }
    .filters { margin-bottom: 1rem; }
    td small { display: block; font-size: 0.72rem; }
    tr.overdue td:first-child { box-shadow: inset 3px 0 0 var(--warn); }
  `,
})
export class CotizacionesPage {
  private readonly data = inject(CotizadorData);

  protected readonly filters = FILTERS;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly quotes = signal<QuoteSummary[]>([]);
  protected readonly filter = signal<Filter>('all');

  private readonly today = todayLocal();

  protected readonly visible = computed(() => {
    const chosen = this.filter();

    return this.quotes().filter((quote) => {
      if (chosen === 'all') return true;
      if (chosen === 'overdue') return this.overdue(quote);
      return quote.status === chosen;
    });
  });

  constructor() {
    void this.load();
  }

  protected overdue(quote: QuoteSummary): boolean {
    return isOverdue(quote, this.today);
  }

  protected tone(quote: QuoteSummary): BadgeTone {
    return this.overdue(quote) ? 'warn' : TONES[quote.status];
  }

  /** A quote past its date reads as expired even if nobody marked it. */
  protected label(quote: QuoteSummary): string {
    return this.overdue(quote) && quote.status !== 'expired'
      ? `${QUOTE_STATUS_LABELS[quote.status]} · vencida`
      : QUOTE_STATUS_LABELS[quote.status];
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.quotes.set(await this.data.listQuotes());
    } catch (cause) {
      this.error.set(
        cause instanceof DataError ? cause.message : 'No pudimos leer las cotizaciones.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
