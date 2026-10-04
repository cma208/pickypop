import {
  calculateBatchCost,
  calculatePrice,
  type BatchCostBreakdown,
  type BatchInput,
  type CostProfile,
  type PriceBreakdown,
  type PrinterProfile,
  type SlicedPlate,
} from '../../core/pricing';

/**
 * The shape a quote is built in, and how it turns into the shared domain
 * input. Nothing here does arithmetic on money: that all lives in
 * @pickypop/domain, which is already tested.
 */

export type MaterialValuation = 'weighted_avg' | 'last_cost' | 'replacement';

export const VALUATION_LABELS: Record<MaterialValuation, string> = {
  weighted_avg: 'costo promedio del stock',
  last_cost: 'último costo de compra',
  replacement: 'costo de reposición',
};

const GRAMS_PER_KG = 1000;

/** Where a plate came from, which is worth showing back to the user. */
export type PlateSource = 'file' | 'recipe' | 'manual';

export interface FilamentDraft {
  /** AMS slot as the slicer reports it. */
  slot: number;
  grams: number;
  colorHex: string | null;
  type: string | null;
  trayInfoIdx: string | null;
  filamentSkuId: string | null;
}

export interface PlateDraft {
  label: string;
  printTimeSeconds: number;
  /** Finished units one run of this plate contributes. */
  unitsPerRun: number;
  source: PlateSource;
  sourceFileName: string | null;
  filaments: FilamentDraft[];
}

export type SupplyScope = 'unit' | 'batch';

export interface SupplyDraft {
  label: string;
  inventoryItemId: string | null;
  scope: SupplyScope;
  quantity: number;
  unitCost: number;
}

export interface LineDraft {
  description: string;
  variantId: string | null;
  quantity: number;
  setupMinutes: number;
  minutesPerUnit: number;
  plates: PlateDraft[];
  supplies: SupplyDraft[];
}

/** What a SKU costs today, under the valuation method the profile asks for. */
export interface FilamentOption {
  id: string;
  label: string;
  colorHex: string | null;
  trayInfoIdx: string | null;
  availableG: number;
  costPerKg: number | null;
  /** The method actually used, which may differ when the preferred one is blank. */
  valuationUsed: MaterialValuation | null;
}

export interface PrinterOption extends PrinterProfile {
  id: string;
}

// ------------------------------------------------------------- suggestions

function parseHex(hex: string | null): [number, number, number] | null {
  if (hex === null) return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const value = Number.parseInt(match[1] as string, 16);

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Plain RGB distance. Good enough to tell "the same red" from "another red". */
function colorDistance(a: string | null, b: string | null): number | null {
  const left = parseHex(a);
  const right = parseHex(b);
  if (left === null || right === null) return null;

  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

/** Beyond this the colours are simply different, so we rather suggest nothing. */
const NEAR_COLOR_THRESHOLD = 40;

/**
 * Proposes the stock SKU a sliced filament most likely came from, crossing the
 * Bambu profile id with the colour, as docs/01-investigacion.md 1.2 suggests.
 * Returns null when nothing is close enough: a wrong guess costs more than a
 * blank the user has to fill.
 */
export function suggestFilamentSku(
  filament: Pick<FilamentDraft, 'colorHex' | 'trayInfoIdx'>,
  options: FilamentOption[],
): string | null {
  let best: { id: string; score: number } | null = null;

  for (const option of options) {
    let score = 0;

    const sameTray =
      filament.trayInfoIdx !== null &&
      option.trayInfoIdx !== null &&
      filament.trayInfoIdx.toLowerCase() === option.trayInfoIdx.toLowerCase();
    if (sameTray) score += 100;

    const distance = colorDistance(filament.colorHex, option.colorHex);
    if (distance !== null && distance <= NEAR_COLOR_THRESHOLD) {
      score += 100 - distance;
    }

    if (score > 0 && (best === null || score > best.score)) best = { id: option.id, score };
  }

  return best === null ? null : best.id;
}

// ----------------------------------------------------------------- drafting

export function plateFromSlicedPlate(
  plate: SlicedPlate,
  fileName: string,
  skus: FilamentOption[],
): PlateDraft {
  return {
    // The slicer's own estimate includes heating and tool changes: docs 1.2.
    printTimeSeconds: plate.predictionSeconds ?? 0,
    label: plate.objectNames[0] ?? `Placa ${plate.index}`,
    unitsPerRun: 1,
    source: 'file',
    sourceFileName: fileName,
    filaments: plate.filaments.map((filament) => {
      const draft = {
        slot: filament.id,
        grams: filament.usedGrams ?? 0,
        colorHex: filament.colorHex,
        type: filament.type,
        trayInfoIdx: filament.trayInfoIdx,
      };

      return { ...draft, filamentSkuId: suggestFilamentSku(draft, skus) };
    }),
  };
}

export function emptyPlate(index: number): PlateDraft {
  return {
    label: `Placa ${index}`,
    printTimeSeconds: 0,
    unitsPerRun: 1,
    source: 'manual',
    sourceFileName: null,
    filaments: [emptyFilament(1)],
  };
}

export function emptyFilament(slot: number): FilamentDraft {
  return { slot, grams: 0, colorHex: null, type: null, trayInfoIdx: null, filamentSkuId: null };
}

export function emptyLine(): LineDraft {
  return {
    description: '',
    variantId: null,
    quantity: 1,
    setupMinutes: 0,
    minutesPerUnit: 0,
    plates: [],
    supplies: [],
  };
}

// ---------------------------------------------------------------- costing

export interface LineResult {
  cost: BatchCostBreakdown;
  price: PriceBreakdown;
  /** Filaments still without a SKU, so the material cost is understated. */
  missingSkus: number;
}

export interface PriceSettings {
  volumeDiscountRate: number;
  urgencySurchargeRate: number;
  channelCommissionRate: number;
}

export const NO_ADJUSTMENTS: PriceSettings = {
  volumeDiscountRate: 0,
  urgencySurchargeRate: 0,
  channelCommissionRate: 0,
};

function costPerKgOf(skuId: string | null, skus: FilamentOption[]): number {
  if (skuId === null) return 0;

  return skus.find((sku) => sku.id === skuId)?.costPerKg ?? 0;
}

export function toBatchInput(line: LineDraft, skus: FilamentOption[]): BatchInput {
  return {
    units: Math.max(1, Math.round(line.quantity)),
    setupMinutes: line.setupMinutes,
    minutesPerUnit: line.minutesPerUnit,
    plates: line.plates.map((plate) => ({
      label: plate.label,
      printTimeSeconds: plate.printTimeSeconds,
      unitsPerRun: plate.unitsPerRun,
      filaments: plate.filaments.map((filament) => ({
        label: skus.find((sku) => sku.id === filament.filamentSkuId)?.label ?? `Ranura ${filament.slot}`,
        grams: filament.grams,
        costPerKg: costPerKgOf(filament.filamentSkuId, skus),
      })),
    })),
    suppliesPerUnit: line.supplies
      .filter((supply) => supply.scope === 'unit')
      .map((supply) => ({ label: supply.label, cost: supply.quantity * supply.unitCost })),
    suppliesPerBatch: line.supplies
      .filter((supply) => supply.scope === 'batch')
      .map((supply) => ({ label: supply.label, cost: supply.quantity * supply.unitCost })),
  };
}

/**
 * Costs a line and prices it. Returns null when the line cannot be costed yet
 * (no plates, or a plate that produces nothing), instead of throwing at the
 * user while they are still typing.
 */
export function calculateLine(
  line: LineDraft,
  skus: FilamentOption[],
  profile: CostProfile,
  printer: PrinterProfile,
  settings: PriceSettings,
): LineResult | null {
  if (line.plates.length === 0) return null;
  if (line.plates.some((plate) => plate.unitsPerRun <= 0)) return null;

  try {
    const cost = calculateBatchCost(toBatchInput(line, skus), profile, printer);
    const price = calculatePrice(cost.costPerUnit, profile, {
      volumeDiscountRate: settings.volumeDiscountRate,
      urgencySurchargeRate: settings.urgencySurchargeRate,
      channelCommissionRate: settings.channelCommissionRate,
    });

    const missingSkus = line.plates
      .flatMap((plate) => plate.filaments)
      .filter((filament) => filament.grams > 0 && filament.filamentSkuId === null).length;

    return { cost, price, missingSkus };
  } catch {
    return null;
  }
}

export interface MaterialLineRow {
  plateLabel: string;
  slot: number;
  label: string;
  colorHex: string | null;
  /** Grams for the whole batch: one run's grams times the runs needed. */
  grams: number;
  cost: number;
  skuMissing: boolean;
}

/**
 * Material cost broken down by filament for the whole batch.
 *
 * calculateBatchCost only reports material per plate, so each filament is run
 * through the same function on its own, with no print time, so there is no
 * energy or machine cost to get in the way. The figures are therefore the very
 * ones the batch total adds up, not a second implementation of the formula.
 */
export function materialLines(
  line: LineDraft,
  skus: FilamentOption[],
  profile: CostProfile,
  printer: PrinterProfile,
): MaterialLineRow[] {
  const units = Math.max(1, Math.round(line.quantity));
  const rows: MaterialLineRow[] = [];

  for (const plate of line.plates) {
    if (plate.unitsPerRun <= 0) continue;
    const runs = Math.ceil(units / plate.unitsPerRun);

    for (const filament of plate.filaments) {
      const sku = skus.find((option) => option.id === filament.filamentSkuId);
      const costPerKg = sku?.costPerKg ?? 0;

      const { material } = calculateBatchCost(
        {
          units: runs,
          setupMinutes: 0,
          minutesPerUnit: 0,
          plates: [
            {
              printTimeSeconds: 0,
              unitsPerRun: 1,
              filaments: [{ grams: filament.grams, costPerKg }],
            },
          ],
        },
        profile,
        printer,
      );

      rows.push({
        plateLabel: plate.label,
        slot: filament.slot,
        label: sku?.label ?? 'Sin filamento elegido',
        colorHex: sku?.colorHex ?? filament.colorHex,
        grams: filament.grams * runs,
        cost: material,
        skuMissing: filament.filamentSkuId === null,
      });
    }
  }

  return rows;
}

/** Grams of a given SKU the whole line needs, to warn about short stock. */
export function gramsBySku(line: LineDraft, skus: FilamentOption[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const plate of line.plates) {
    const runs = Math.ceil(Math.max(1, Math.round(line.quantity)) / Math.max(plate.unitsPerRun, 1e-9));

    for (const filament of plate.filaments) {
      if (filament.filamentSkuId === null) continue;
      const current = totals.get(filament.filamentSkuId) ?? 0;
      totals.set(filament.filamentSkuId, current + filament.grams * runs);
    }
  }

  // Only report SKUs we still know about.
  for (const id of [...totals.keys()]) {
    if (!skus.some((sku) => sku.id === id)) totals.delete(id);
  }

  return totals;
}

export function costPerGram(costPerKg: number): number {
  return costPerKg / GRAMS_PER_KG;
}
