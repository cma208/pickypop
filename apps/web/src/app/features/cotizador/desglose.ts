import { Component, computed, input } from '@angular/core';
import { FORMAT_PIPES } from '../../ui';
import { totalFor, type BatchCostBreakdown, type CostProfile, type PriceBreakdown } from '../../core/pricing';
import { unitsText } from './quantity-text';
import type { MaterialLineRow } from './quote-model';

const REGIME_LABELS: Record<CostProfile['taxRegime'], string> = {
  none: 'sin RUC',
  nrus: 'NRUS',
  rer: 'RER',
  rmt: 'RMT',
  general: 'Régimen General',
};

/**
 * The full breakdown, the way docs/02-dominio.md section 2.5 lays it out.
 *
 * Shared by the calculator and by a saved quote, so what the customer was
 * shown and what is on file read exactly the same.
 */
@Component({
  selector: 'pp-desglose',
  imports: [...FORMAT_PIPES],
  template: `
    <table>
      <caption class="sr-only">Desglose del costo</caption>
      <tbody>
        @for (plate of cost().plates; track $index) {
          <tr>
            <th scope="row">
              {{ plate.label || 'Placa ' + ($index + 1) }}
              <small class="muted">
                {{ plate.runs }} {{ plate.runs === 1 ? 'corrida' : 'corridas' }},
                {{ plate.printHours * 3600 | duration }}
                @if (plate.spareUnits > 0) {
                  · {{ plate.spareUnits }} de más que quedan en stock
                }
              </small>
            </th>
            <td class="num">{{ plate.material | money }}</td>
          </tr>
        }

        @for (row of materials(); track $index) {
          <tr class="detail">
            <th scope="row">
              <span class="dot" [style.background]="row.colorHex || 'transparent'"></span>
              {{ row.label }}
              <small class="muted">
                ranura {{ row.slot }} · {{ row.grams | grams }}
                @if (row.skuMissing) { · <span class="error">sin filamento elegido</span> }
              </small>
            </th>
            <td class="num">{{ row.cost | money }}</td>
          </tr>
        }

        <tr>
          <th scope="row">Material</th>
          <td class="num">{{ cost().material | money }}</td>
        </tr>
        <tr>
          <th scope="row">
            Energía <small class="muted">{{ cost().printHours * 3600 | duration }} de impresión</small>
          </th>
          <td class="num">{{ cost().energy | money }}</td>
        </tr>
        <tr>
          <th scope="row">
            Máquina
            <small class="muted">{{ cost().machineRatePerHour | money }} por hora</small>
          </th>
          <td class="num">{{ cost().machine | money }}</td>
        </tr>
        <tr>
          <th scope="row">Provisión por fallos</th>
          <td class="num">{{ cost().failureAllowance | money }}</td>
        </tr>
        <tr class="total">
          <th scope="row">Producción</th>
          <td class="num">{{ cost().production | money }}</td>
        </tr>
        <tr>
          <th scope="row">Preparación del lote</th>
          <td class="num">{{ cost().laborSetup | money }}</td>
        </tr>
        <tr>
          <th scope="row">
            Trabajo por unidad <small class="muted">{{ units() }}</small>
          </th>
          <td class="num">{{ cost().laborPerUnits | money }}</td>
        </tr>
        <tr>
          <th scope="row">Insumos</th>
          <td class="num">{{ cost().supplies | money }}</td>
        </tr>
        <tr class="total">
          <th scope="row">Costo del lote</th>
          <td class="num">{{ cost().total | money }}</td>
        </tr>
        <tr class="total">
          <th scope="row">Costo por unidad</th>
          <td class="num">{{ cost().costPerUnit | money }}</td>
        </tr>
      </tbody>
    </table>

    @if (price(); as p) {
      <table>
        <caption class="sr-only">Del costo al precio</caption>
        <tbody>
          <tr>
            <th scope="row">
              @if (fromCatalog()) {
                Precio de catálogo <small class="muted">sin IGV, de la escalera de precios</small>
              } @else {
                Precio base <small class="muted">margen del {{ profile().targetMargin | percent1 }}</small>
              }
            </th>
            <td class="num">{{ p.basePrice | money }}</td>
          </tr>
          @if (p.adjustedPrice !== p.basePrice) {
            <tr>
              <th scope="row">Con descuentos y recargos</th>
              <td class="num">{{ p.adjustedPrice | money }}</td>
            </tr>
          }
          @if (p.afterMinimum !== p.adjustedPrice) {
            <tr>
              <th scope="row">
                Precio mínimo <small class="muted">{{ profile().minOrderPrice | money }}</small>
              </th>
              <td class="num">{{ p.afterMinimum | money }}</td>
            </tr>
          }
          <tr>
            <th scope="row">
              Valor de venta
              @if (p.saleValue !== p.afterMinimum) {
                <small class="muted">incluye la comisión del canal</small>
              }
            </th>
            <td class="num">{{ p.saleValue | money }}</td>
          </tr>
          @if (p.igv > 0) {
            <tr>
              <th scope="row">IGV <small class="muted">{{ profile().igvRate | percent1 }}</small></th>
              <td class="num">{{ p.igv | money }}</td>
            </tr>
          } @else {
            <tr>
              <th scope="row" colspan="2" class="muted">
                Sin IGV: el taller está {{ regime() }}
              </th>
            </tr>
          }
          <tr class="total">
            <th scope="row">
              Precio por unidad
              @if (!fromCatalog()) {
                <small class="muted">redondeado a {{ profile().roundingStep | money }}</small>
              }
            </th>
            <td class="num">{{ p.total | money }}</td>
          </tr>
          <tr class="total">
            <th scope="row">Total por {{ units() }}</th>
            <td class="num">{{ batchTotal() | money }}</td>
          </tr>
          <tr>
            <th scope="row">Margen que queda</th>
            <td class="num">
              {{ p.marginAmount | money }}
              <small class="muted">({{ p.effectiveMarginRate | percent1 }})</small>
            </td>
          </tr>
        </tbody>
      </table>
    }

    <div class="pockets">
      <p>
        <strong>{{ cost().cashOutOfPocket | money }}</strong>
        <span class="muted">sale del bolsillo hoy: material, energía e insumos</span>
      </p>
      <p>
        <strong>{{ cost().assigned | money }}</strong>
        <span class="muted">es tiempo y desgaste: máquina y mano de obra</span>
      </p>
    </div>
  `,
  styles: `
    :host { display: block; }
    table { margin-bottom: 1rem; }
    th { text-transform: none; font-size: 0.9rem; font-weight: 400; color: inherit; letter-spacing: 0; }
    th small { display: block; font-size: 0.75rem; font-weight: 400; }
    tr.detail th { padding-left: 1.5rem; }
    tr.total th, tr.total td { font-weight: 600; }
    .dot {
      display: inline-block; width: 0.7rem; height: 0.7rem; margin-right: 0.35rem;
      border: 1px solid var(--line); border-radius: 50%; vertical-align: baseline;
    }
    .pockets { display: grid; gap: 0.5rem; }
    .pockets p { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; margin: 0; }
    .pockets small, .pockets .muted { font-size: 0.85rem; }
    .sr-only {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip: rect(0 0 0 0); white-space: nowrap;
    }
  `,
})
export class Desglose {
  readonly cost = input.required<BatchCostBreakdown>();
  readonly price = input<PriceBreakdown | null>(null);
  readonly materials = input<MaterialLineRow[]>([]);
  readonly profile = input.required<CostProfile>();
  /** The price came from the catalog's price list, not from the target margin. */
  readonly fromCatalog = input(false);

  protected readonly regime = computed(() => REGIME_LABELS[this.profile().taxRegime]);
  protected readonly units = computed(() => unitsText(this.cost().units));
  /** What the customer pays for the batch, by the same rule as the quote's own total. */
  protected readonly batchTotal = computed(() => {
    const price = this.price();
    return price === null ? null : totalFor(price.total, this.cost().units);
  });
}
