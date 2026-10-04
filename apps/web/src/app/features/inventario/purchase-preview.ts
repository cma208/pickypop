import { Component, computed, input } from '@angular/core';
import { FORMAT_PIPES } from '../../ui';
import { INVENTORY_STYLES } from './inventario.styles';
import type { PlanLine, PurchasePlan } from './purchase-plan';

const COST_PER_GRAM_DIGITS = 3;

export interface PreviewRow {
  label: string;
  kind: 'sku' | 'item';
  quantity: number;
  unit: string;
  unitPrice: number;
  netWeightG: number | null;
  line: PlanLine;
}

interface CostGroup {
  count: number;
  cost: number;
  perGram: number | null;
}

/**
 * What every spool (or unit of a supply) will really cost once shipping and
 * other costs are spread over the purchase. Shown before anything is saved.
 */
@Component({
  selector: 'app-purchase-preview',
  imports: [FORMAT_PIPES],
  template: `
    <p class="muted intro">{{ methodText() }}</p>

    @if (plan().fellBack) {
      <p class="alert alert-warn">
        Ninguna línea tiene un peso conocido, así que el reparto por peso se hizo por monto.
      </p>
    }

    @for (row of rows(); track $index) {
      <article class="row-card">
        <h3>{{ row.label }}</h3>
        <dl>
          <div><dt>Compra</dt><dd>{{ row.quantity }} {{ row.unit }} × {{ row.unitPrice | money }} = {{ row.line.subtotal | money }}</dd></div>
          <div><dt>Parte del envío y otros costos</dt><dd>{{ row.line.extra | money }}</dd></div>
          @if (row.kind === 'sku') {
            @for (group of groups()[$index]; track group.cost) {
              <div class="final">
                <dt>{{ group.count === 1 ? '1 rollo' : group.count + ' rollos' }} a costo final de</dt>
                <dd>
                  {{ group.cost | money }}
                  @if (group.perGram !== null) { <small class="muted">({{ group.perGram | money: perGramDigits }} por g)</small> }
                </dd>
              </div>
            }
          } @else {
            <div class="final">
              <dt>Costo final por {{ row.unit }}</dt>
              <dd>{{ row.line.effectiveUnitCost | money: 3 }}</dd>
            </div>
          }
        </dl>
      </article>
    } @empty {
      <p class="muted">Agrega productos para ver el costo final.</p>
    }

    <dl class="totals">
      <div><dt>Subtotal de productos</dt><dd>{{ plan().subtotal | money }}</dd></div>
      <div><dt>Envío y otros costos</dt><dd>{{ plan().extra | money }}</dd></div>
      <div class="grand"><dt>Total de la compra</dt><dd>{{ plan().total | money }}</dd></div>
    </dl>
  `,
  styles: [
    INVENTORY_STYLES,
    `
      .intro { margin: 0 0 0.75rem; font-size: 0.85rem; }
      .row-card { padding: 0.75rem 0; border-bottom: 1px solid var(--line); }
      h3 { margin: 0 0 0.4rem; font-size: 0.95rem; }
      dl { margin: 0; display: grid; gap: 0.25rem; }
      dl > div { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      dt { color: var(--muted); font-size: 0.85rem; }
      dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
      .final dt { color: var(--text); font-weight: 600; }
      .final dd { font-weight: 600; color: var(--accent); }
      .totals { margin-top: 1rem; }
      .grand { padding-top: 0.5rem; border-top: 1px solid var(--line); font-size: 1.05rem; }
      .grand dt, .grand dd { color: var(--text); font-weight: 700; font-size: 1.05rem; }
    `,
  ],
})
export class PurchasePreview {
  readonly rows = input.required<PreviewRow[]>();
  readonly plan = input.required<PurchasePlan>();

  protected readonly perGramDigits = COST_PER_GRAM_DIGITS;

  protected readonly methodText = computed(() =>
    this.plan().method === 'by_weight'
      ? 'El envío y los otros costos se reparten por peso: los insumos no reciben parte porque no tienen peso conocido.'
      : 'El envío y los otros costos se reparten por monto: cada línea carga una parte proporcional a lo que costó.',
  );

  protected readonly groups = computed(() =>
    this.rows().map((row) => groupCosts(row.line.unitCosts, row.netWeightG)),
  );
}

/** "2 rollos a S/ 53.33 y 1 a S/ 53.34": equal costs are listed once. */
function groupCosts(unitCosts: number[], netWeightG: number | null): CostGroup[] {
  const counts = new Map<number, number>();
  for (const cost of unitCosts) counts.set(cost, (counts.get(cost) ?? 0) + 1);

  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([cost, count]) => ({ count, cost, perGram: netWeightG ? cost / netWeightG : null }));
}
