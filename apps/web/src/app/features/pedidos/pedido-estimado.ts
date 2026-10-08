import { Component, computed, input } from '@angular/core';
import { Card, FORMAT_PIPES } from '../../ui';
import { costDifference, deliveredEstimate } from './pedidos.delivery';
import type { OrderLine, OrderSummary } from './pedidos.data';
import type { OrderPurpose } from './pedidos.labels';

/**
 * Estimated against real. Each kind of line has its own real cost: what is
 * made to order costs its print jobs; what comes off the shelf costs what
 * left it (ADR-022), «Lo entregado». An order of catalogue products only has
 * no jobs of its own, so it never speaks of them.
 */
@Component({
  selector: 'app-pedido-estimado',
  imports: [Card, ...FORMAT_PIPES],
  template: `
    <pp-card heading="Estimado contra real">
      @if (summary(); as s) {
        <div class="scroll">
          <table>
            <thead><tr><th></th><th class="num">Estimado</th><th class="num">Real</th><th class="num">Diferencia</th></tr></thead>
            <tbody>
              @if (s.deliveredUnits > 0) {
                <tr>
                  <td>Lo entregado ({{ s.deliveredUnits }} {{ s.deliveredUnits === 1 ? 'unidad' : 'unidades' }})</td>
                  <td class="num">{{ deliveredEstimate() | money }}</td>
                  <td class="num">{{ s.deliveredCost | money }}</td>
                  <td class="num" [class.error]="s.deliveredCost > deliveredEstimate()">{{ difference(s.deliveredCost, deliveredEstimate()) | money }}</td>
                </tr>
              }
              @if (printsForIt()) {
                <tr>
                  <td>{{ s.deliveredUnits > 0 ? 'Todo el pedido' : 'Costo de producción' }}</td>
                  <td class="num">{{ s.estimatedCost | money }}</td>
                  <td class="num">{{ closedJobs() ? (s.realProductionCost | money) : '—' }}</td>
                  <td class="num" [class.error]="closedJobs() && s.realProductionCost > s.estimatedCost">
                    {{ closedJobs() ? (difference(s.realProductionCost, s.estimatedCost) | money) : '—' }}
                  </td>
                </tr>
              } @else if (!allDelivered()) {
                <!-- Once everything is out, «Lo entregado» already is the whole order. -->
                <tr>
                  <td>Todo el pedido</td>
                  <td class="num">{{ s.estimatedCost | money }}</td>
                  <td class="num">—</td>
                  <td class="num">—</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <dl class="facts">
          @if (printsForIt()) {
            <dt>Trabajos</dt><dd>{{ s.jobs }} ({{ s.successfulJobs }} exitosos, {{ s.failedJobs }} fallidos)</dd>
            <dt>Horas impresas</dt><dd>{{ s.printedHours }} h</dd>
          }
          <!-- A cancelled sale sold nothing: «Vendido por» beside «no admite cobros» said otherwise. -->
          @if (purpose() === 'sale' && !cancelled()) {
            <dt>Vendido por</dt><dd>{{ s.soldFor | money }}</dd>
            @if (printsForIt() && closedJobs()) {
              <dt>Ganancia real</dt><dd>{{ difference(s.soldFor, s.realProductionCost) | money }}</dd>
            } @else if (!printsForIt() && allDelivered()) {
              <dt>Ganancia real</dt><dd>{{ difference(s.soldFor, s.deliveredCost) | money }}</dd>
            }
          }
        </dl>
        <p class="muted note">
          @if (cancelled()) {
            <!-- Nothing more will be printed or delivered for it: what is still to come never comes. -->
            El pedido se canceló{{ purpose() === 'sale' ? ': no hubo venta' : '' }}.
            @if (printsForIt() && closedJobs()) { El costo real es lo que se llegó a imprimir para él. }
          } @else {
            @if (s.deliveredUnits > 0) {
              Lo entregado cuesta lo que salió del estante: piezas, insumos y empaque al promedio de lo que había, más
              la mano de obra de armar y empacar (lo armado antes de que se sumara entró sin ella). Es lo que cuenta
              Resultados; el estimado es lo que costaría hacer un lote nuevo de esa cantidad.
            }
            @if (printsForIt()) {
              El costo real de producción suma material, luz y máquina de las impresiones de lo hecho a medida, y es parcial mientras falten por imprimir.
              @if (!closedJobs()) { Todavía no hay impresiones cerradas, por eso no hay costo real. }
            } @else if (s.deliveredUnits === 0) {
              Lo del catálogo sale del estante: su costo real es «Lo entregado», lo que cuesta lo que sale al entregarlo. Aparece con la primera entrega.
            } @else if (!allDelivered()) {
              El resto tendrá su costo real cuando se entregue.
            }
          }
        </p>
      } @else if (error(); as message) {
        <p class="error">{{ message }}</p>
      } @else {
        <p class="muted">No hay resumen de producción para este pedido.</p>
      }
    </pp-card>
  `,
  styles: `
    .scroll { overflow-x: auto; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 1rem 0 0; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .note { font-size: 0.82rem; margin: 0.75rem 0 0; }
  `,
})
export class PedidoEstimado {
  readonly summary = input<OrderSummary | null>(null);
  readonly error = input<string | null>(null);
  readonly lines = input.required<OrderLine[]>();
  readonly purpose = input.required<OrderPurpose>();
  readonly cancelled = input(false);
  /** Made-to-order lines, or jobs already tied to the order: the real cost has prints. */
  readonly printsForIt = input(false);

  protected readonly deliveredEstimate = computed(() => deliveredEstimate(this.lines()));
  protected readonly closedJobs = computed(() => {
    const summary = this.summary();
    return summary !== null && summary.successfulJobs + summary.failedJobs > 0;
  });
  protected readonly allDelivered = computed(
    () => this.lines().length > 0 && this.lines().every((line) => line.delivered >= line.quantity),
  );

  protected difference(real: number, estimated: number): number {
    return costDifference(real, estimated);
  }
}
