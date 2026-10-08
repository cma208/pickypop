import { Component, computed, inject } from '@angular/core';
import { Card, Badge, FORMAT_PIPES } from '../../ui';
import { SHARED_STYLES } from './catalogo.styles';
import { itemsWithoutCost, marginOf, priceFallsShort } from './costing';
import { VariantCostModel } from './variant-cost.model';

/** Current cost of the variant for a number of units, with the full breakdown. */
@Component({
  selector: 'app-costo-variante',
  imports: [Card, Badge, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      .controls { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: end; margin-bottom: 1rem; }
      .controls label { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      .controls input { width: 6rem; }
      .controls select { width: auto; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
      .chips button { padding: 0.25rem 0.6rem; }
      .chips button[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
      table { min-width: 20rem; }
      tr.subtotal td { font-weight: 600; }
      tr.total td { font-weight: 700; border-top: 2px solid var(--line); }
      td.indent { padding-left: 1.5rem; color: var(--muted); }
      .summary { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 1rem 0 0; font-size: 0.9rem; }
      h3 { margin: 1.25rem 0 0.4rem; font-size: 0.9rem; }
      .prov { display: grid; grid-template-columns: minmax(0, 1fr) 7rem; gap: 0.5rem; align-items: center; margin-bottom: 0.4rem; font-size: 0.85rem; }
    `,
  ],
  template: `
    <pp-card heading="Costo actual">
      @if (cost.blocker(); as reason) {
        <p class="muted">{{ reason }}</p>
      } @else {
        <div class="controls">
          <label>Unidades del lote
            <input type="number" min="1" step="1" inputmode="numeric" [value]="cost.units()" (input)="setUnits($any($event.target).value)" />
          </label>
          <div class="chips" role="group" aria-label="Cantidades sugeridas">
            @for (quantity of suggested(); track quantity) {
              <button type="button" class="secondary" [attr.aria-pressed]="quantity === cost.units()" (click)="cost.units.set(quantity)">
                {{ quantity }}
              </button>
            }
          </div>
          @if (printers().length > 1) {
            <label>Impresora
              <select (change)="cost.printerId.set($any($event.target).value)" aria-label="Impresora para la hora de máquina">
                @for (printer of printers(); track printer.id) {
                  <option [value]="printer.id" [selected]="printer.id === cost.printer()?.id">
                    {{ printer.name }} · {{ printer.machineRatePerHour | money }}/h
                  </option>
                }
              </select>
            </label>
          }
        </div>

        @if (cost.current(); as result) {
          @let b = result.breakdown;
          <div class="scroll">
            <table>
              <thead>
                <tr><th>Concepto</th><th class="num">Lote de {{ b.units }}</th><th class="num">Por unidad</th></tr>
              </thead>
              <tbody>
                @for (plate of b.plates; track $index) {
                  <tr>
                    <td class="indent">{{ plate.label }}: {{ plate.runs }} {{ plate.runs === 1 ? 'corrida' : 'corridas' }}, {{ plate.printHours * 3600 | duration }}
                      @if (plate.spareUnits > 0) { · sobran {{ plate.spareUnits }} (se pagan igual) }
                    </td>
                    <td class="num">{{ plate.material | money }}</td>
                    <td class="num">{{ plate.material / b.units | money:3 }}</td>
                  </tr>
                }
                <tr><td>Material (con merma)</td><td class="num">{{ b.material | money }}</td><td class="num">{{ b.material / b.units | money:3 }}</td></tr>
                <tr><td>Energía ({{ b.printHours * 3600 | duration }} de impresión)</td><td class="num">{{ b.energy | money }}</td><td class="num">{{ b.energy / b.units | money:3 }}</td></tr>
                <tr><td>Máquina ({{ b.machineRatePerHour | money }} la hora)</td><td class="num">{{ b.machine | money }}</td><td class="num">{{ b.machine / b.units | money:3 }}</td></tr>
                <tr><td>Reserva por fallos ({{ profile()!.failureRate | percent1 }})</td><td class="num">{{ b.failureAllowance | money }}</td><td class="num">{{ b.failureAllowance / b.units | money:3 }}</td></tr>
                <tr class="subtotal"><td>Producción</td><td class="num">{{ b.production | money }}</td><td class="num">{{ b.production / b.units | money:3 }}</td></tr>
                <tr><td>Preparación del lote (se paga una vez)</td><td class="num">{{ b.laborSetup | money }}</td><td class="num">{{ b.laborSetup / b.units | money:3 }}</td></tr>
                <tr><td>Trabajo por unidad (no baja con el lote)</td><td class="num">{{ b.laborPerUnits | money }}</td><td class="num">{{ b.laborPerUnits / b.units | money:3 }}</td></tr>
                @for (supply of result.suppliesPerUnit; track $index) {
                  <tr>
                    <td class="indent">{{ supply.label }}{{ supply.known ? '' : ' (sin costo)' }}</td>
                    <td class="num">{{ supply.cost * b.units | money }}</td>
                    <td class="num">{{ supply.cost | money:3 }}</td>
                  </tr>
                }
                <tr><td>Insumos</td><td class="num">{{ b.supplies | money }}</td><td class="num">{{ b.supplies / b.units | money:3 }}</td></tr>
                <tr class="total"><td>Costo</td><td class="num">{{ b.total | money }}</td><td class="num">{{ b.total / b.units | money:3 }}</td></tr>
              </tbody>
            </table>
          </div>

          <p class="summary muted">
            <span>Sale del bolsillo: {{ b.cashOutOfPocket | money }}</span>
            <span>Costo asignado (máquina y tiempo propio): {{ b.assigned | money }}</span>
          </p>

          @if (priceCheck(); as check) {
            <p class="summary">
              <span>Precio por unidad a {{ b.units }} u.: <strong>{{ check.price | money }}</strong></span>
              <span>Margen: <pp-badge [tone]="check.below ? 'bad' : 'good'">{{ check.margin | percent1 }}</pp-badge></span>
              <span class="muted">Objetivo: {{ profile()!.targetMargin | percent1 }}</span>
            </p>
            @if (check.below) {
              <div class="notice" role="alert">
                <p>Con este lote el margen queda por debajo del objetivo. Ver la escalera de precios para el detalle.</p>
              </div>
            }
          }

          @if (result.warnings.length > 0) {
            <h3>Para tener en cuenta</h3>
            <div class="notice">
              <ul>
                @for (warning of result.warnings; track warning) { <li>{{ warning }}</li> }
              </ul>
            </div>
          }
        } @else {
          <p class="muted">Escribe una cantidad entera de unidades desde 1 para calcular.</p>
        }

        @if (missingSupplies().length > 0) {
          <h3>Probar un costo para lo que no tiene registro</h3>
          <p class="muted hint">
            Solo para este cálculo en pantalla: no se guarda. El costo real de un insumo se registra al comprarlo; el de
            una pieza que imprime otra receta, al cerrar su impresión.
          </p>
          @for (item of missingSupplies(); track item.id) {
            <label class="prov">
              <span>{{ item.name }} (S/ por {{ item.unit }})</span>
              <input type="number" min="0" step="any" inputmode="decimal" [attr.aria-label]="'Costo provisional de ' + item.name" (input)="setProvisional(item.id, $any($event.target).value)" />
            </label>
          }
        }
      }
    </pp-card>
  `,
})
export class CostoVariante {
  protected readonly cost = inject(VariantCostModel);

  protected readonly profile = this.cost.profile;
  protected readonly printers = computed(() => this.cost.context()?.printers ?? []);

  /** One unit, each tier's minimum and the default batch: the sizes worth looking at. */
  protected readonly suggested = computed(() => {
    const quantities = [1, ...this.cost.tiers().map((tier) => tier.minQuantity)];
    return [...new Set(quantities)].sort((a, b) => a - b);
  });

  protected readonly missingSupplies = computed(() => {
    const recipe = this.cost.recipe();
    return recipe ? itemsWithoutCost(recipe, this.cost.lookups()?.supplies ?? []) : [];
  });

  protected readonly priceCheck = computed(() => {
    const price = this.cost.priceAtUnits();
    const result = this.cost.current();
    const profile = this.profile();
    if (price === null || !result || !profile) return null;

    const margin = marginOf(price, result.breakdown.costPerUnit);
    return { price, margin, below: priceFallsShort(price, margin, profile.targetMargin) };
  });

  protected setUnits(raw: string): void {
    this.cost.units.set(raw === '' ? 0 : Number(raw));
  }

  protected setProvisional(itemId: string, raw: string): void {
    this.cost.provisionalCosts.update((costs) => {
      const next = { ...costs };
      if (raw === '' || Number.isNaN(Number(raw))) delete next[itemId];
      else next[itemId] = Number(raw);
      return next;
    });
  }
}
