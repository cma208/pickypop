import { Component, computed, inject, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { AsyncState, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { FinanzasData } from './finanzas.data';
import { monthLabel, yearOf } from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';
import { addedSign, addUpMonths, failedShare, netMargin, reserveCovers, subtractedSign, type MonthResult } from './results';

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
    <pp-page title="Resultados" subtitle="Ventas menos costo de ventas y gastos, más otros ingresos, mes a mes">
      <div class="explainer">
        <p>
          <strong>El costo de ventas es lo que de verdad costó lo vendido.</strong> Lo entregado cuesta lo que
          salió del estante: piezas, insumos y empaque a lo que valían, más la mano de obra de armar y empacar. Lo
          que falta entregar de un pedido va a su costo estimado hasta que se entregue. Una venta suelta ya no
          carga el costo de un lote entero.
        </p>
        <p>
          <strong>Las compras de inventario no restan de la utilidad.</strong> Lo comprado llega al costo de
          ventas cuando se vende lo que se hizo con ello, y restar además las compras lo contaría dos veces.
          Mientras tanto sigue en el estante, así que se informa aparte.
        </p>
        <p>
          <strong>Los aportes y los retiros del dueño son capital, no utilidad.</strong> Meter o sacar
          plata tuya cambia cuánto dinero hay en el taller, no cuánto ganó el taller, así que tampoco
          entran en la utilidad neta.
        </p>
        <p>
          <strong>Los otros ingresos sí suman.</strong> Son la plata que entra sin ser venta ni aporte: un
          reembolso, la devolución de un proveedor. Es del taller, así que suma a la utilidad neta en su
          propia línea. Las ventas no van por aquí: van por Pedidos o por la Venta rápida, que sacan lo
          vendido del estante y llevan su costo, y por eso cuentan en «Ventas».
        </p>
        <p>
          <strong>Lo que se imprime y no se vende sí resta.</strong> Un molde, una prueba o una pieza que
          faltó al contar el estante costaron filamento, luz y máquina, y ningún pedido los va a pagar. Si el
          molde o la prueba fallan, ese intento también resta: es parte de lo que costaron. También resta una
          impresión fallida que ningún precio paga: la de lo que va al estante (lo vendido cuesta lo que salió
          del estante, y un intento fallido nunca llegó ahí), la de un regalo y la de un pedido cancelado. Solo
          no resta la de un pedido que todavía se cuenta a su costo estimado (un trabajo a medida, o un pedido
          del catálogo que aún no sale del estante), porque la paga la reserva por fallos de ese estimado.
        </p>
        <p>
          <strong>Las fallas se miden en costo, no en cantidad de impresiones.</strong> Se comparan con lo que
          se imprimió para producir, que es lo que lleva la reserva: un molde o una prueba no la llevan y no
          cuentan, ni cuando salen ni cuando fallan. Por eso no es la misma cifra que «fallos» en Hoy, que cuenta impresiones: fallar una placa
          chica pesa poco en costo.
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
                  <th class="num hide-small">Otros ingresos</th>
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
                    <td class="num hide-small">{{ row.otherIncome | money }}</td>
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
                  <td class="num hide-small">{{ totals().otherIncome | money }}</td>
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
                    <span>Costo de ventas <small class="sub">lo que costó lo vendido: lo entregado, a lo que salió del estante (material, insumos, empaque, luz, máquina y mano de obra); lo que falta entregar, a su estimado</small></span>
                    <span class="value" [class.neg]="row.costOfSales > 0">{{ minus(row.costOfSales) }}{{ row.costOfSales | money }}</span>
                  </li>
                  <li class="sum"><span>Utilidad bruta</span><span class="value">{{ row.grossProfit | money }}</span></li>
                  <li>
                    <span>Gastos de operación <small class="sub">luz, envíos, publicidad, comisiones</small></span>
                    <span class="value" [class.neg]="row.operatingExpenses > 0">{{ minus(row.operatingExpenses) }}{{ row.operatingExpenses | money }}</span>
                  </li>
                  @if (row.unsoldProduction !== 0) {
                    <li>
                      <span>
                        Producción no vendida
                        <small class="sub">
                          moldes, herramientas, pruebas e impresiones de pedidos cancelados: {{ row.toolsAndTests | money }} · conteo del estante:
                          {{ row.shelfCountLosses | money }}{{ row.shelfCountLosses < 0 ? ' (sobró más de lo que faltó)' : '' }}
                          @if (row.uncoveredFailedPrints !== 0) {
                            · impresiones fallidas que ningún precio paga (estante, regalos, pedidos cancelados): {{ row.uncoveredFailedPrints | money }}
                          }
                        </small>
                      </span>
                      <span class="value" [class.neg]="row.unsoldProduction > 0">{{ row.unsoldProduction > 0 ? '−' : '+' }}{{ abs(row.unsoldProduction) | money }}</span>
                    </li>
                  }
                  @if (row.otherIncome !== 0) {
                    <li>
                      <span>Otros ingresos <small class="sub">plata que entra sin ser venta ni aporte: un reembolso, la devolución de un proveedor</small></span>
                      <span class="value" [class.pos]="row.otherIncome > 0">{{ plus(row.otherIncome) }}{{ row.otherIncome | money }}</span>
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
                            {{ share(row) | percent1 }} de lo impreso para producir en el mes ({{ row.printCost | money }}),
                            medido en costo y no en cantidad de impresiones. Moldes y pruebas no cuentan, tampoco
                            cuando fallan: van en «Producción no vendida». Las que ningún precio paga ya restan ahí;
                            aquí se comparan todas con lo que tus precios reservan para fallos.
                            @if (row.failureReserveRate !== null) {
                              La reserva por fallos de tus precios es {{ row.failureReserveRate | percent1 }}{{ covers(row) ? ': alcanza.' : ': no alcanzó, súbela o revisa qué está fallando.' }}
                            }
                          </small>
                        </span>
                        <span class="value">{{ row.failedPrints | money }}</span>
                      </li>
                    }
                    <li>
                      <span>Compras de inventario <small class="sub">no restan aquí: llegan al costo de ventas cuando se vende lo hecho con ellas</small></span>
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

  protected covers(row: MonthResult): boolean {
    return reserveCovers(row) !== false;
  }

  protected abs(value: number): number {
    return Math.abs(value);
  }

  protected minus(value: number): string {
    return subtractedSign(value);
  }

  protected plus(value: number): string {
    return addedSign(value);
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
