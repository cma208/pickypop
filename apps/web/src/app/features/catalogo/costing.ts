import {
  calculateBatchCost,
  calculatePrice,
  type BatchCostBreakdown,
  type BatchInput,
  type CostProfile,
  type PrinterProfile,
} from '../../core/pricing';
import type { Lookups, Recipe, RecipeFilament, SkuOption, SupplyOption } from './catalogo.models';

const GRAMS_PER_KG = 1000;

/** Where the price of a gram of filament came from, best source first. */
export type GramCostSource = 'stock' | 'replacement' | 'material-average' | 'missing';

export interface GramCost {
  costPerGram: number;
  source: GramCostSource;
}

export interface CostResult {
  breakdown: BatchCostBreakdown;
  /** Things the person should know before trusting the number. */
  warnings: string[];
  /** Per finished unit, for the "por unidad" column. */
  suppliesPerUnit: { label: string; cost: number; known: boolean }[];
}

export interface CostSources {
  recipe: Recipe;
  lookups: Lookups;
  profile: CostProfile;
  printer: PrinterProfile;
  /** Costs typed in by hand for supplies that have none on record. */
  provisionalSupplyCosts: Record<string, number>;
}

/**
 * Price of one gram for a recipe filament. A SKU with stock gives the weighted
 * cost; otherwise its replacement cost; otherwise the average of the other
 * SKUs of the same material, which is only an estimate.
 */
export function gramCost(filament: RecipeFilament, lookups: Lookups): GramCost {
  const sku = lookups.skus.find((candidate) => candidate.id === filament.skuId);

  if (sku?.stockCostPerGram != null) return { costPerGram: sku.stockCostPerGram, source: 'stock' };
  if (sku?.replacementCostPerGram != null) {
    return { costPerGram: sku.replacementCostPerGram, source: 'replacement' };
  }

  const sameMaterial = lookups.skus.filter(
    (candidate) => candidate.materialId === filament.materialId && priceOf(candidate) !== null,
  );
  if (sameMaterial.length > 0) {
    const total = sameMaterial.reduce((sum, candidate) => sum + (priceOf(candidate) ?? 0), 0);
    return { costPerGram: total / sameMaterial.length, source: 'material-average' };
  }

  return { costPerGram: 0, source: 'missing' };
}

function priceOf(sku: SkuOption): number | null {
  return sku.stockCostPerGram ?? sku.replacementCostPerGram;
}

/**
 * Joins the active supplies with their row in `inventory_item_costs`. A supply
 * the view does not know, or one with no purchase and no standard cost, keeps a
 * null cost so the screen can say it is missing rather than showing it as free.
 */
export function supplyOptions(
  items: { id: string; name: string; unit: string; image_path?: string | null; kind?: SupplyOption['kind'] }[],
  costs: { inventory_item_id: string | null; cost_per_unit: number | null }[],
): SupplyOption[] {
  const costPerUnit = new Map(
    costs.flatMap((row) =>
      row.inventory_item_id === null || row.cost_per_unit === null
        ? []
        : [[row.inventory_item_id, Number(row.cost_per_unit)] as const],
    ),
  );
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    unit: item.unit,
    costPerUnit: costPerUnit.get(item.id) ?? null,
    imagePath: item.image_path ?? null,
    kind: item.kind ?? null,
  }));
}

export function supplyCostPerUnit(
  inventoryItemId: string,
  quantityPerUnit: number,
  sources: Pick<CostSources, 'lookups' | 'provisionalSupplyCosts'>,
): { cost: number; known: boolean } {
  const recorded = sources.lookups.supplies.find((item) => item.id === inventoryItemId)?.costPerUnit;
  const unitCost = recorded ?? sources.provisionalSupplyCosts[inventoryItemId];
  return unitCost === undefined ? { cost: 0, known: false } : { cost: unitCost * quantityPerUnit, known: true };
}

function plateName(label: string | null, index: number): string {
  return label?.trim() || `Placa ${index}`;
}

/** Builds what `calculateBatchCost` needs and collects the caveats on the way. */
export function buildBatch(sources: CostSources, units: number): { batch: BatchInput; result: Omit<CostResult, 'breakdown'> } {
  const { recipe, lookups } = sources;
  const warnings: string[] = [];

  const plates = recipe.plates.map((plate) => {
    const name = plateName(plate.label, plate.plateIndex);
    if (plate.filaments.length === 0) warnings.push(`${name}: no tiene filamentos, no suma material.`);

    return {
      label: name,
      printTimeSeconds: plate.printTimeS,
      unitsPerRun: plate.unitsPerRun,
      filaments: plate.filaments.map((filament) => {
        const cost = gramCost(filament, lookups);
        warnings.push(...filamentWarnings(name, filament, cost));
        return {
          label: `${name}, ranura ${filament.slot}`,
          grams: filament.grams,
          costPerKg: cost.costPerGram * GRAMS_PER_KG,
        };
      }),
    };
  });

  const suppliesPerUnit = recipe.supplies.map((supply) => {
    const item = lookups.supplies.find((candidate) => candidate.id === supply.inventoryItemId);
    const label = item?.name ?? 'Insumo';
    const { cost, known } = supplyCostPerUnit(supply.inventoryItemId, supply.quantityPerUnit, sources);
    if (!known) warnings.push(`${label}: no tiene costo registrado, no suma al costo.`);
    return { label, cost, known };
  });

  return {
    batch: {
      units,
      plates,
      setupMinutes: recipe.setupMinutes,
      minutesPerUnit: recipe.minutesPerUnit,
      suppliesPerUnit: suppliesPerUnit.map(({ label, cost }) => ({ label, cost })),
    },
    result: { warnings, suppliesPerUnit },
  };
}

function filamentWarnings(plate: string, filament: RecipeFilament, cost: GramCost): string[] {
  const where = `${plate}, ranura ${filament.slot}`;
  switch (cost.source) {
    case 'replacement':
      return [`${where}: sin stock, se usa el costo de reposición del SKU.`];
    case 'material-average':
      return [
        filament.skuId
          ? `${where}: el SKU no tiene costo, se estima con el promedio del mismo material.`
          : `${where}: sin SKU asignado, se estima con el promedio del mismo material.`,
      ];
    case 'missing':
      return [`${where}: no hay costo de ningún filamento de ese material, no suma al costo.`];
    default:
      return [];
  }
}

/** Costs the recipe for a number of units; null when the inputs cannot be costed. */
export function computeCost(sources: CostSources, units: number): CostResult | null {
  if (!Number.isInteger(units) || units <= 0 || sources.recipe.plates.length === 0) return null;

  const { batch, result } = buildBatch(sources, units);
  try {
    return { breakdown: calculateBatchCost(batch, sources.profile, sources.printer), ...result };
  } catch {
    return null;
  }
}

/** Margin over the price, the way the workshop defines it. */
export function marginOf(unitPrice: number, costPerUnit: number): number | null {
  return unitPrice > 0 ? (unitPrice - costPerUnit) / unitPrice : null;
}

/**
 * Lowest unit price that reaches the target margin at this cost. It is the
 * base price, before the per-order minimum, which does not apply to a unit.
 */
export function targetPriceFor(costPerUnit: number, profile: CostProfile): number {
  return calculatePrice(costPerUnit, profile).basePrice;
}

const MARGIN_TOLERANCE = 1e-9;

export function isBelowTarget(margin: number | null, targetMargin: number): boolean {
  return margin !== null && margin + MARGIN_TOLERANCE < targetMargin;
}
