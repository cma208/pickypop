import { DRAFT_COST_PROFILE_PE, DRAFT_PRINTER_A1_MINI } from '@pickypop/domain';
import type { Lookups, Recipe, RecipeFilament, RecipeSupply, SupplyOption } from './catalogo.models';
import {
  computeCost,
  gramCost,
  isBelowTarget,
  itemsWithoutCost,
  marginOf,
  priceFallsShort,
  splitRecipeRows,
  supplyOptions,
  targetPriceFor,
} from './costing';
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
  printedParts: new Set(),
});

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'r1',
  variantId: 'v1',
  version: 1,
  setupMinutes: 0,
  minutesPerUnit: 0,
  note: null,
  assembled: true,
  plates: [{ id: 'p1', label: 'Tapas', plateIndex: 1, unitsPerRun: 9, printTimeS: 3600, filaments: [filament()], outputs: [], thumbnailPath: null, sourceFileName: null, fileRecord: null }],
  supplies: [],
  ...overrides,
});

/** A recipe row, carrying the item it points at as `getRecipe` reads it. */
const row = (
  id: string,
  inventoryItemId: string,
  quantityPerUnit: number,
  item: Partial<RecipeSupply['item']> = {},
): RecipeSupply => ({
  id,
  inventoryItemId,
  quantityPerUnit,
  item: { kind: 'supply', name: inventoryItemId, unit: 'unidad', imagePath: null, ...item },
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
    const withBag = recipe({ supplies: [row('s1', 'bag', 1, { name: 'Bolsa' })] });
    const result = computeCost(sources(withBag), 5);

    expect(result?.breakdown.supplies).toBe(0);
    expect(result?.warnings.some((warning) => warning.includes('Bolsa'))).toBe(true);
  });

  it('names a part by its own row even when the options were read before it existed', () => {
    const withNewPart = recipe({ supplies: [row('s1', 'cap', 1, { kind: 'part', name: 'Tapa de calavera' })] });
    const printedElsewhere = { ...sources(withNewPart), lookups: { ...lookups(), printedParts: new Set(['cap']) } };
    const result = computeCost(printedElsewhere, 1);

    expect(result?.suppliesPerUnit).toEqual([{ label: 'Tapa de calavera', cost: 0, known: false }]);
    expect(result?.warnings.some((warning) => warning.startsWith('Tapa de calavera: la imprime otra receta'))).toBe(true);
  });

  it('never says another recipe prints a part that no plate prints (T2-07)', () => {
    const orphan = recipe({ supplies: [row('s1', 'back', 1, { kind: 'part', name: 'Trasera de calavera' })] });
    const result = computeCost(sources(orphan), 10);

    expect(result?.warnings).toContain(
      'Trasera de calavera: ninguna placa la imprime, no suma al costo y el plan no sabe con qué placa hacerla.',
    );
    expect(result?.warnings.join(' ')).not.toContain('otra receta');
  });

  it('says a part printed before still counts what it cost, though no plate prints it now', () => {
    const orphan = recipe({ supplies: [row('s1', 'back', 1, { kind: 'part', name: 'Trasera de calavera' })] });
    const withCost = {
      ...sources(orphan),
      lookups: { ...lookups(), supplies: [{ id: 'back', name: 'Trasera de calavera', unit: 'unidad', costPerUnit: 0.48, kind: 'part' as const }] },
    };
    const result = computeCost(withCost, 10);

    expect(result?.suppliesPerUnit).toEqual([{ label: 'Trasera de calavera', cost: 0.48, known: true }]);
    expect(result?.warnings.some((warning) => warning.startsWith('Trasera de calavera: ninguna placa la imprime ahora'))).toBe(
      true,
    );
  });

  it('uses a provisional cost when one is typed in', () => {
    const withBag = recipe({ supplies: [row('s1', 'bag', 1)] });
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
        row('s1', 'sweets', 66),
        row('s2', 'bag', 1),
      ],
    });
    const fromView = { ...sources(potion), lookups: { ...lookups(), supplies: supplyOptions(items, costs) } };
    const beforeTheFix = { ...sources(potion), lookups: { ...lookups(), supplies: supplyOptions(items, []) } };

    expect(computeCost(fromView, 1)?.breakdown.supplies).toBe(1.49);
    expect(computeCost(fromView, 10)?.breakdown.supplies).toBe(14.9);
    expect(computeCost(beforeTheFix, 1)?.breakdown.supplies).toBe(0);
  });
});

describe('splitRecipeRows', () => {
  it('tells parts from supplies by the row, not by the options', () => {
    // The import just created the cap: no option list knows it yet.
    const rows = [row('s1', 'cap', 1, { kind: 'part' }), row('s2', 'bag', 1, { kind: 'packaging' }), row('s3', 'sweets', 66)];

    const { parts, supplies } = splitRecipeRows(rows);

    expect(parts.map((part) => part.inventoryItemId)).toEqual(['cap']);
    expect(supplies.map((supply) => supply.inventoryItemId)).toEqual(['bag', 'sweets']);
  });
});

describe('itemsWithoutCost', () => {
  const options: SupplyOption[] = [
    { id: 'cap', name: 'Tapa de calavera', unit: 'unidad', costPerUnit: null, kind: 'part' },
    { id: 'hook', name: 'Gancho', unit: 'unidad', costPerUnit: null, kind: 'part' },
    { id: 'bag', name: 'Bolsa', unit: 'unidad', costPerUnit: null, kind: 'packaging' },
    { id: 'sweets', name: 'Dulces', unit: 'g', costPerUnit: 0.015, kind: 'supply' },
  ];
  const skull = recipe({
    plates: [
      {
        id: 'p1', label: 'Tapas', plateIndex: 1, unitsPerRun: 7, printTimeS: 3600, filaments: [filament()],
        outputs: [{ id: 'o1', inventoryItemId: 'cap', unitsPerRun: 7 }],
        thumbnailPath: null, sourceFileName: null, fileRecord: null,
      },
    ],
    supplies: [row('s1', 'cap', 1, { kind: 'part' }), row('s2', 'hook', 1, { kind: 'part' }), row('s3', 'bag', 1), row('s4', 'sweets', 66)],
  });

  it('leaves out the parts the recipe prints itself: their cost is in the runs', () => {
    expect(itemsWithoutCost(skull, options).map((item) => item.id)).not.toContain('cap');
  });

  it('keeps what really lacks a cost, a part printed by another recipe among them', () => {
    expect(itemsWithoutCost(skull, options).map((item) => item.id)).toEqual(['hook', 'bag']);
  });

  it('is consistent with the cost: a provisional cost for what it offers does change the total', () => {
    const before = computeCost({ ...sources(skull), lookups: { ...lookups(), supplies: options } }, 1)!;
    const after = computeCost(
      { ...sources(skull), lookups: { ...lookups(), supplies: options }, provisionalSupplyCosts: { cap: 1, hook: 1 } },
      1,
    )!;
    // Only the hook moves it: the cap is made by the recipe's own plate.
    expect(after.breakdown.supplies - before.breakdown.supplies).toBeCloseTo(1, 6);
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

  it('takes a price of zero as short of any target: it gives the product away (T2-08)', () => {
    expect(priceFallsShort(0, marginOf(0, 1.61), 0.5)).toBe(true);
    expect(priceFallsShort(19, marginOf(19, 1.61), 0.5)).toBe(false);
    expect(priceFallsShort(2, marginOf(2, 1.61), 0.5)).toBe(true);
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
