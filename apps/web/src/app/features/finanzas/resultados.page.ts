import { Component, computed, inject, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { AsyncState, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { FinanzasData } from './finanzas.data';
import { monthLabel, yearOf } from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';
import { addUpMonths, failedShare, netMargin, type MonthResult } from './results';

const ALL_YEARS = '';

@Component({
  selector: 'app-resultados',
  imports: [Page, Card, AsyncState, Empty, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    FINANCE_STYLES,
    `
      .total-row td { border-top: 2px solid var(--line); font-weight: 600; }
      .picked { background: var(--accent-soft); }
      .month-button { padding: 0.15rem 0.4rem; font-size: 0.8rem; }
      .lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
      .lines li { display: flex; gap: 1rem; justify-content: space-between; }
      .lines li.sum { padding-top: 0.4rem; border-top: 1px solid var(--line); font-weight: 600; }
      .lines .value { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .apart { margin-top: 1rem; }
      .apart h3 { margin: 0 0 0.5rem; font-size: 0.9rem; }
    `,
  ],
  template: `
    <pp-page title="Resultados" subtitle="Ventas menos costo de ventas menos gastos, mes a mes">
      <div class="explainer">
        <p>
          <strong>Las compras de inventario no restan de la utilidad.</strong> Su costo ya llega por el
          costo de ventas, que es lo que cuesta hacer cada cosa vendida según su receta; restarlas otra vez
          lo contaría dos veces. Por eso se informan aparte.
        </p>
        <p>
          <strong>Los aportes y los retiros del dueño son capital, no utilidad.</strong> Meter o sacar
          plata tuya cambia cuánto dinero hay en el taller, no cuánto ganó el taller, así que tampoco
          entran en la utilidad neta.
        </p>
        <p>
          <strong>Lo que se imprime y no se vende sí resta.</strong> Un molde, una prueba o una pieza que
          faltó al contar el estante costaron filamento, luz y máquina, y ningún pedido los va a pagar. Las
          impresiones fallidas no se restan: las paga la reserva por fallos que ya va en el costo de ventas.
          Se muestran aparte para que veas si esa reserva alcanza.
        </p>
      </div>

      <pp-async [loading]="loading()" [error]="error()">
        @if (months().length === 0) {
          <pp-empty message="Todavía no hay meses con ventas ni movimientos que mostrar." />
        } @else {
          @if (years().length > 1) {
            <div class="filters">
              <label class="filter">
                Año
                <select [value]="year()" (change)="onYear($event)">
                  <option [value]="allYears">Todos</option>
                  @for (value of years(); track value) {
                    <option [value]="value">{{ value }}</option>
                  }
                </select>
              </label>
            </div>
          }

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th class="num">Ventas</th>
                  <th class="num hide-small">Costo de ventas</th>
                  <th class="num hide-small">Utilidad bruta</th>
                  <th class="num hide-small">Gastos</th>
                  <th class="num hide-small">No vendido</th>
                  <th class="num">Utilidad neta</th>
                  <th class="num hide-small">Margen</th>
                </tr>
              </thead>
              <tbody>
                @for (row of visible(); track row.month) {
                  <tr [class.picked]="row.month === selectedMonth()">
                    <td>
                      <button type="button" class="ghost month-button" (click)="select(row.month)">
                        {{ label(row.month) }}
                      </button>
                    </td>
                    <td class="num">{{ row.sales | money }}</td>
                    <td class="num hide-small">{{ row.costOfSales | money }}</td>
                    <td class="num hide-small">{{ row.grossProfit | money }}</td>
                    <td class="num hide-small">{{ row.operatingExpenses | money }}</td>
                    <td class="num hide-small">{{ row.unsoldProduction | money }}</td>
                    <td class="num amount-cell" [class.pos]="row.netProfit > 0" [class.neg]="row.netProfit < 0">
                      {{ row.netProfit | money }}
                    </td>
                    <td class="num hide-small">{{ margin(row) === null ? '—' : (margin(row) | percent1) }}</td>
                  </tr>
                }
                <tr class="total-row">
                  <td>Total del periodo</td>
                  <td class="num">{{ totals().sales | money }}</td>
                  <td class="num hide-small">{{ totals().costOfSales | money }}</td>
                  <td class="num hide-small">{{ totals().grossProfit | money }}</td>
                  <td class="num hide-small">{{ totals().operatingExpenses | money }}</td>
                  <td class="num hide-small">{{ totals().unsoldProduction | money }}</td>
                  <td class="num" [class.pos]="totals().netProfit > 0" [class.neg]="totals().netProfit < 0">
                    {{ totals().netProfit | money }}
                  </td>
                  <td class="num hide-small">
                    {{ totalMargin() === null ? '—' : (totalMargin() | percent1) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          @if (selected(); as row) {
            <div class="apart">
              <pp-card [heading]="label(row.month)">
                <ul class="lines">
                  <li><span>Ventas</span><span class="value">{{ row.sales | money }}</span></li>
                  <li>
                    <span>Costo de ventas <small class="sub">lo que cuesta hacer lo vendido, según su receta: material, insumos, empaque, luz, máquina y mano de obra</small></span>
                    <span class="value neg">−{{ row.costOfSales | money }}</span>
                  </li>
                  <li class="sum"><span>Utilidad bruta</span><span class="value">{{ row.grossProfit | money }}</span></li>
                  <li>
                    <span>Gastos de operación <small class="sub">luz, envíos, publicidad, comisiones</small></span>
                    <span class="value neg">−{{ row.operatingExpenses | money }}</span>
                  </li>
                  @if (row.unsoldProduction !== 0) {
                    <li>
                      <span>
                        Producción no vendida
                        <small class="sub">
                          moldes, herramientas y pruebas: {{ row.toolsAndTests | money }} · conteo del estante:
                          {{ row.shelfCountLosses | money }}{{ row.shelfCountLosses < 0 ? ' (sobró más de lo que faltó)' : '' }}
                        </small>
                      </span>
                      <span class="value" [class.neg]="row.unsoldProduction > 0">{{ row.unsoldProduction > 0 ? '−' : '+' }}{{ abs(row.unsoldProduction) | money }}</span>
                    </li>
                  }
                  <li class="sum">
                    <span>Utilidad neta</span>
                    <span class="value" [class.pos]="row.netProfit > 0" [class.neg]="row.netProfit < 0">
                      {{ row.netProfit | money }}
                    </span>
                  </li>
                </ul>

                <div class="apart">
                  <h3>Se informa aparte, fuera de la utilidad</h3>
                  <ul class="lines">
                    @if (row.printCost > 0) {
                      <li>
                        <span>
                          Impresiones fallidas
                          <small class="sub">
                            {{ share(row) | percent1 }} de lo impreso en el mes ({{ row.printCost | money }}).
                            @if (row.failureReserveRate !== null) {
                              La reserva por fallos de tus precios es {{ row.failureReserveRate | percent1 }}{{ (share(row) ?? 0) > row.failureReserveRate ? ': no alcanzó, súbela o revisa qué está fallando.' : ': alcanza.' }}
                            }
                          </small>
                        </span>
                        <span class="value">{{ row.failedPrints | money }}</span>
                      </li>
                    }
                    <li>
                      <span>Otros ingresos <small class="sub">entradas que no son de un pedido</small></span>
                      <span class="value">{{ row.otherIncome | money }}</span>
                    </li>
                    <li>
                      <span>Compras de inventario <small class="sub">ya contadas en el costo de ventas</small></span>
                      <span class="value">{{ row.inventoryPurchases | money }}</span>
                    </li>
                    <li>
                      <span>Aportes del dueño <small class="sub">capital que entra</small></span>
                      <span class="value">{{ row.ownerContributions | money }}</span>
                    </li>
                    <li>
                      <span>Retiros del dueño <small class="sub">capital que sale</small></span>
                      <span class="value">{{ row.ownerDraws | money }}</span>
                    </li>
                  </ul>
                </div>
              </pp-card>
            </div>
          }
        }
      </pp-async>
    </pp-page>
  `,
})
export class ResultadosPage {
  private readonly data = inject(FinanzasData);

  protected readonly allYears = ALL_YEARS;

  protected readonly months = signal<MonthResult[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly year = signal(ALL_YEARS);
  protected readonly selectedMonth = signal<string | null>(null);

  protected readonly years = computed(() => [...new Set(this.months().map((row) => yearOf(row.month)))]);

  protected readonly visible = computed(() =>
    this.year() === ALL_YEARS
      ? this.months()
      : this.months().filter((row) => yearOf(row.month) === this.year()),
  );

  protected readonly totals = computed(() => addUpMonths(this.visible()));
  protected readonly totalMargin = computed(() => netMargin(this.totals()));

  protected readonly selected = computed(() =>
    this.visible().find((row) => row.month === this.selectedMonth()) ?? null,
  );

  constructor() {
    void this.load();
  }

  protected label(month: string): string {
    return monthLabel(month);
  }

  protected margin(row: MonthResult): number | null {
    return netMargin(row);
  }

  protected share(row: MonthResult): number | null {
    return failedShare(row);
  }

  protected abs(value: number): number {
    return Math.abs(value);
  }

  /** Clicking the month that is open closes it again. */
  protected select(month: string): void {
    this.selectedMonth.update((current) => (current === month ? null : month));
  }

  protected onYear(event: Event): void {
    this.year.set((event.target as HTMLSelectElement).value);
    this.selectedMonth.set(null);
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      const months = await this.data.incomeStatement();
      this.months.set(months);
      // The newest month is what anyone opens this screen for.
      this.selectedMonth.set(months[0]?.month ?? null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar los resultados. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
