import { DRAFT_COST_PROFILE_PE, DRAFT_PRINTER_A1_MINI } from '@pickypop/domain';
import type { Lookups, Recipe, RecipeFilament } from './catalogo.models';
import { computeCost, gramCost, isBelowTarget, marginOf, supplyOptions, targetPriceFor } from './costing';
import { parseTags, slugify } from './catalogo.util';

const filament = (overrides: Partial<RecipeFilament> = {}): RecipeFilament => ({
  id: 'f1',
  slot: 1,
  materialId: 'pla',
  colorHex: '#ff0000',
  skuId: 'red',
  grams: 100,
  ...overrides,
});

const lookups = (): Lookups => ({
  materials: [{ id: 'pla', code: 'PLA' }],
  skus: [
    { id: 'red', materialId: 'pla', label: 'Rojo', colorHex: null, trayInfoIdx: null, active: true, stockCostPerGram: 0.05, replacementCostPerGram: 0.06 },
    { id: 'blue', materialId: 'pla', label: 'Azul', colorHex: null, trayInfoIdx: null, active: true, stockCostPerGram: null, replacementCostPerGram: 0.07 },
    { id: 'green', materialId: 'pla', label: 'Verde', colorHex: null, trayInfoIdx: null, active: true, stockCostPerGram: null, replacementCostPerGram: null },
  ],
  supplies: [{ id: 'bag', name: 'Bolsa', unit: 'unidad', costPerUnit: null }],
});

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'r1',
  variantId: 'v1',
  version: 1,
  setupMinutes: 0,
  minutesPerUnit: 0,
  note: null,
  plates: [{ id: 'p1', label: 'Tapas', plateIndex: 1, producesItemId: null, unitsPerRun: 9, printTimeS: 3600, filaments: [filament()] }],
  supplies: [],
  ...overrides,
});

const sources = (r = recipe()) => ({
  recipe: r,
  lookups: lookups(),
  profile: DRAFT_COST_PROFILE_PE,
  printer: DRAFT_PRINTER_A1_MINI,
  provisionalSupplyCosts: {},
});

describe('gramCost', () => {
  it('prefers the weighted stock cost', () => {
    expect(gramCost(filament(), lookups())).toEqual({ costPerGram: 0.05, source: 'stock' });
  });

  it('falls back to replacement cost when there is no stock', () => {
    expect(gramCost(filament({ skuId: 'blue' }), lookups()).source).toBe('replacement');
  });

  it('estimates with the material average when no SKU is assigned', () => {
    const cost = gramCost(filament({ skuId: null }), lookups());
    expect(cost.source).toBe('material-average');
    expect(cost.costPerGram).toBeCloseTo(0.0575);
  });

  it('reports a missing cost when nothing of the material has a price', () => {
    const bare = { ...lookups(), skus: [lookups().skus[2]!] };
    expect(gramCost(filament({ skuId: 'green' }), bare)).toEqual({ costPerGram: 0, source: 'missing' });
  });
});

describe('computeCost', () => {
  it('prints whole runs and pays for the spare pieces', () => {
    const result = computeCost(sources(), 10);
    const plate = result?.breakdown.plates[0];

    expect(plate?.runs).toBe(2);
    expect(plate?.spareUnits).toBe(8);
    // 2 runs x 100 g x 1.03 (waste) x S/ 0.05 per gram
    expect(result?.breakdown.material).toBe(10.3);
  });

  it('spreads the setup over the batch but not the minutes per unit', () => {
    const labelled = recipe({ setupMinutes: 30, minutesPerUnit: 4 });
    const one = computeCost(sources(labelled), 1)?.breakdown;
    const ten = computeCost(sources(labelled), 10)?.breakdown;

    expect(one?.laborSetup).toBe(ten?.laborSetup);
    expect(ten?.laborPerUnits).toBe((one?.laborPerUnits ?? 0) * 10);
  });

  it('warns about supplies without a recorded cost and counts them as zero', () => {
    const withBag = recipe({ supplies: [{ id: 's1', inventoryItemId: 'bag', quantityPerUnit: 1 }] });
    const result = computeCost(sources(withBag), 5);

    expect(result?.breakdown.supplies).toBe(0);
    expect(result?.warnings.some((warning) => warning.includes('Bolsa'))).toBe(true);
  });

  it('uses a provisional cost when one is typed in', () => {
    const withBag = recipe({ supplies: [{ id: 's1', inventoryItemId: 'bag', quantityPerUnit: 1 }] });
    const result = computeCost({ ...sources(withBag), provisionalSupplyCosts: { bag: 0.5 } }, 4);

    expect(result?.breakdown.supplies).toBe(2);
  });

  it('refuses to cost a recipe with no plates or a bad quantity', () => {
    expect(computeCost(sources(recipe({ plates: [] })), 10)).toBeNull();
    expect(computeCost(sources(), 0)).toBeNull();
    expect(computeCost(sources(), 2.5)).toBeNull();
  });
});

describe('supplyOptions', () => {
  // Rows as `inventory_item_costs` returns them: numerics can arrive as strings.
  const items = [
    { id: 'sweets', name: 'Dulces surtidos', unit: 'g' },
    { id: 'bag', name: 'Bolsa con etiqueta', unit: 'unidad' },
    { id: 'nozzle', name: 'Boquilla 0.4 acero', unit: 'unidad' },
  ];
  const costs = [
    { inventory_item_id: 'sweets', cost_per_unit: 0.015 },
    { inventory_item_id: 'bag', cost_per_unit: '0.5' as unknown as number },
    { inventory_item_id: 'nozzle', cost_per_unit: null },
  ];

  it('takes each cost from the view and keeps a missing one as null', () => {
    const supplies = supplyOptions(items, costs);

    expect(supplies.map((supply) => supply.costPerUnit)).toEqual([0.015, 0.5, null]);
  });

  it('costs the seeded potion bottle at S/ 1.49 per unit, where it used to read zero', () => {
    const potion = recipe({
      supplies: [
        { id: 's1', inventoryItemId: 'sweets', quantityPerUnit: 66 },
        { id: 's2', inventoryItemId: 'bag', quantityPerUnit: 1 },
      ],
    });
    const fromView = { ...sources(potion), lookups: { ...lookups(), supplies: supplyOptions(items, costs) } };
    const beforeTheFix = { ...sources(potion), lookups: { ...lookups(), supplies: supplyOptions(items, []) } };

    expect(computeCost(fromView, 1)?.breakdown.supplies).toBe(1.49);
    expect(computeCost(fromView, 10)?.breakdown.supplies).toBe(14.9);
    expect(computeCost(beforeTheFix, 1)?.breakdown.supplies).toBe(0);
  });
});

describe('margins', () => {
  it('measures the margin over the price, not over the cost', () => {
    expect(marginOf(10, 5)).toBe(0.5);
    expect(marginOf(0, 5)).toBeNull();
  });

  it('flags only what is clearly under the target', () => {
    expect(isBelowTarget(0.5, 0.5)).toBe(false);
    expect(isBelowTarget(0.4999999999999, 0.5)).toBe(false);
    expect(isBelowTarget(0.45, 0.5)).toBe(true);
    expect(isBelowTarget(null, 0.5)).toBe(false);
  });

  it('gives the lowest price that reaches the target margin', () => {
    expect(targetPriceFor(5, DRAFT_COST_PROFILE_PE)).toBe(10);
  });
});

describe('text helpers', () => {
  it('builds a slug without accents or symbols', () => {
    expect(slugify('  Botella de poción ñandú! ')).toBe('botella-de-pocion-nandu');
  });

  it('cleans, lowercases and de-duplicates tags', () => {
    expect(parseTags(' Halloween, regalo ,, halloween ')).toEqual(['halloween', 'regalo']);
  });
});
