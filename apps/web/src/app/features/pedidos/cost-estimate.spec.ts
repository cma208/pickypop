import { DRAFT_COST_PROFILE_PE, DRAFT_PRINTER_A1_MINI } from '@pickypop/domain';
import { calculateBatchCost } from '../../core/pricing';
import { priceRecipeItems, type SupplyCost } from './cost-estimate';

const costs = new Map<string, SupplyCost>([
  ['sweets', { name: 'Dulces surtidos', costPerUnit: 0.015 }],
  ['bag', { name: 'Bolsa con etiqueta', costPerUnit: 0.5 }],
  ['nozzle', { name: 'Boquilla 0.4 acero', costPerUnit: null }],
]);

const potionBottle = [
  { inventoryItemId: 'sweets', quantityPerUnit: 66 },
  { inventoryItemId: 'bag', quantityPerUnit: 1 },
];

function suppliesOf(units: number, suppliesPerUnit: { label: string; cost: number }[]): number {
  // A batch needs a plate to be costed; this one prints nothing that costs money.
  const plate = { printTimeSeconds: 0, unitsPerRun: 1, filaments: [] };
  const batch = { units, setupMinutes: 0, minutesPerUnit: 0, plates: [plate], suppliesPerUnit };
  return calculateBatchCost(batch, DRAFT_COST_PROFILE_PE, DRAFT_PRINTER_A1_MINI).supplies;
}

describe('priceRecipeItems', () => {
  it('prices each item at quantity times cost per unit', () => {
    const { suppliesPerUnit, unpriced } = priceRecipeItems(potionBottle, costs);

    expect(suppliesPerUnit.map((supply) => supply.label)).toEqual([
      'Dulces surtidos',
      'Bolsa con etiqueta',
    ]);
    expect(suppliesPerUnit[0].cost).toBeCloseTo(0.99, 10);
    expect(suppliesPerUnit[1].cost).toBe(0.5);
    expect(unpriced).toEqual([]);
  });

  it('adds up to S/ 1.49 of supplies for a potion bottle, and scales with the batch', () => {
    const { suppliesPerUnit } = priceRecipeItems(potionBottle, costs);

    expect(suppliesOf(1, suppliesPerUnit)).toBe(1.49);
    expect(suppliesOf(10, suppliesPerUnit)).toBe(14.9);
  });

  it('counts an item with no recorded cost as zero and reports it by name', () => {
    const { suppliesPerUnit, unpriced } = priceRecipeItems(
      [...potionBottle, { inventoryItemId: 'nozzle', quantityPerUnit: 1 }],
      costs,
    );

    expect(suppliesPerUnit[2]).toEqual({ label: 'Boquilla 0.4 acero', cost: 0 });
    expect(unpriced).toEqual(['Boquilla 0.4 acero']);
    expect(suppliesOf(1, suppliesPerUnit)).toBe(1.49);
  });

  it('treats an item the view does not return as unpriced too', () => {
    const { unpriced } = priceRecipeItems([{ inventoryItemId: 'ghost', quantityPerUnit: 2 }], costs);

    expect(unpriced).toEqual(['Insumo']);
  });
});
