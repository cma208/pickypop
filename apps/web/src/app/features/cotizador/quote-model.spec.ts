import { DRAFT_COST_PROFILE_PE, DRAFT_PRINTER_A1_MINI } from '@pickypop/domain';
import { sumMoney } from '../../core/pricing';
import {
  calculateLine,
  catalogUnitPrice,
  materialLines,
  NO_ADJUSTMENTS,
  type CatalogPricing,
  type FilamentOption,
  type LineDraft,
  type PlateDraft,
} from './quote-model';

const sku = (id: string, costPerKg: number): FilamentOption => ({
  id,
  label: `PLA ${id}`,
  colorHex: null,
  trayInfoIdx: null,
  availableG: 1000,
  costPerKg,
  valuationUsed: 'weighted_avg',
});

const SKUS = [sku('red', 47.3), sku('black', 61.9)];

const plate = (overrides: Partial<PlateDraft>): PlateDraft => ({
  label: 'Plate',
  printTimeSeconds: 1800,
  unitsPerRun: 1,
  source: 'manual',
  sourceFileName: null,
  filaments: [],
  ...overrides,
});

const filament = (slot: number, grams: number, filamentSkuId: string | null) => ({
  slot,
  grams,
  colorHex: null,
  type: null,
  trayInfoIdx: null,
  filamentSkuId,
});

const line = (plates: PlateDraft[], quantity = 13): LineDraft => ({
  description: 'Test',
  variantId: null,
  quantity,
  setupMinutes: 0,
  minutesPerUnit: 0,
  plates,
  supplies: [],
});

const profile = DRAFT_COST_PROFILE_PE;
const printer = DRAFT_PRINTER_A1_MINI;

describe('materialLines', () => {
  const draft = line([
    plate({
      label: 'Body',
      unitsPerRun: 2,
      filaments: [filament(1, 3.337, 'red'), filament(2, 7.771, 'black'), filament(3, 2.249, null)],
    }),
    plate({ label: 'Caps', unitsPerRun: 7, filaments: [filament(1, 1.117, 'black')] }),
  ]);

  it('adds up to the material the batch is costed with, to the cent', () => {
    const rows = materialLines(draft, SKUS, profile, printer);
    const result = calculateLine(draft, SKUS, profile, printer, NO_ADJUSTMENTS);

    expect(rows).toHaveLength(4);
    expect(sumMoney(rows.map((row) => row.cost))).toBe(result?.cost.material);
  });

  it('counts grams for every run of the plate and flags the filament without a SKU', () => {
    const rows = materialLines(draft, SKUS, profile, printer);

    // 13 units at 2 per run is 7 runs of the body plate.
    expect(rows[0]?.grams).toBeCloseTo(3.337 * 7, 6);
    expect(rows[2]).toMatchObject({ skuMissing: true, cost: 0, label: 'Sin filamento elegido' });
    expect(rows[3]?.grams).toBeCloseTo(1.117 * 2, 6);
  });

  it('skips a plate that produces nothing and keeps the rest', () => {
    const withBroken = line([
      plate({ label: 'Broken', unitsPerRun: 0, filaments: [filament(1, 5, 'red')] }),
      plate({ label: 'Ok', filaments: [filament(1, 5, 'red')] }),
    ]);

    expect(materialLines(withBroken, SKUS, profile, printer).map((row) => row.plateLabel)).toEqual(['Ok']);
    expect(materialLines(line([]), SKUS, profile, printer)).toEqual([]);
  });
});

describe('catalog lines', () => {
  const bottle = [plate({ unitsPerRun: 1, filaments: [filament(1, 30, 'red')] })];
  const catalog: CatalogPricing = {
    listPrice: 12,
    tiers: [
      { minQuantity: 1, unitPrice: 12 },
      { minQuantity: 10, unitPrice: 8.5 },
    ],
  };

  it('quotes a catalog product at its price list, the one the order charges', () => {
    const draft = { ...line(bottle, 10), variantId: 'potion' };
    const result = calculateLine(draft, SKUS, profile, printer, NO_ADJUSTMENTS, catalog);

    expect(result?.price.total).toBe(8.5);
    expect(result?.costBased?.total).toBeGreaterThan(0);
    expect(result?.costBased?.total).not.toBe(8.5);
  });

  it('leaves discounts and surcharges to custom work', () => {
    const draft = { ...line(bottle, 10), variantId: 'potion' };
    const settings = { volumeDiscountRate: 0.2, urgencySurchargeRate: 0.5, channelCommissionRate: 0.1 };
    const result = calculateLine(draft, SKUS, profile, printer, settings, catalog);

    expect(result?.price.total).toBe(8.5);
  });

  it('prices custom work from its cost even when a price list is at hand', () => {
    const result = calculateLine(line(bottle, 10), SKUS, profile, printer, NO_ADJUSTMENTS, catalog);

    expect(result?.costBased).toBeNull();
    expect(result?.price.total).not.toBe(8.5);
  });

  it('falls back to the cost when the catalog has no price for that quantity', () => {
    const onlyBulk: CatalogPricing = { listPrice: null, tiers: [{ minQuantity: 10, unitPrice: 8.5 }] };
    const draft = { ...line(bottle, 3), variantId: 'potion' };
    const result = calculateLine(draft, SKUS, profile, printer, NO_ADJUSTMENTS, onlyBulk);

    expect(result?.costBased).toBeNull();
    expect(result?.price.total).toBeGreaterThan(0);
  });
});

describe('catalogUnitPrice', () => {
  it('takes the highest minimum reached, else the list price', () => {
    const catalog: CatalogPricing = { listPrice: 12, tiers: [{ minQuantity: 10, unitPrice: 8.5 }] };

    expect(catalogUnitPrice(catalog, 9)).toBe(12);
    expect(catalogUnitPrice(catalog, 10)).toBe(8.5);
    expect(catalogUnitPrice(null, 10)).toBeNull();
  });

  it('keeps the newer of two tiers with the same minimum, which comes first', () => {
    const catalog: CatalogPricing = {
      listPrice: null,
      tiers: [
        { minQuantity: 10, unitPrice: 9 },
        { minQuantity: 10, unitPrice: 8.5 },
      ],
    };

    expect(catalogUnitPrice(catalog, 10)).toBe(9);
  });
});
