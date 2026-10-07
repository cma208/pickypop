import { inject, Injectable } from '@angular/core';
import { calculateBatchCost, type BatchInput } from '../../core/pricing';
import { SUPABASE } from '../../core/supabase';
import { itemsBeyondPlates, printedByPlates } from '../cotizador/recipe-parts';
import { CostInputs } from './cost-inputs';

const GRAMS_PER_KG = 1000;

export interface CostEstimate {
  perUnit: number;
  total: number;
  /**
   * Supplies in the recipe with no purchase and no standard cost. They are
   * counted at zero, so the estimate is a floor until someone records a cost.
   */
  unpricedSupplies: string[];
}

export interface RecipeItem {
  inventoryItemId: string;
  quantityPerUnit: number;
}

/** One row of `inventory_item_costs` or `part_stock`, reduced to what pricing needs. */
export interface SupplyCost {
  name: string;
  /** Null when the view has no cost for it: no purchase, no production, no standard cost. */
  costPerUnit: number | null;
}

/** A cost row as either view returns it: numerics may arrive as strings. */
export interface CostRow {
  inventory_item_id: string | null;
  name: string | null;
  cost_per_unit: number | string | null;
}

/**
 * What each item costs: a printed part what printing it cost (`part_stock`),
 * anything else its last purchase or standard cost (`inventory_item_costs`).
 * A part in both keeps its production cost: the purchase view has nothing
 * real to say about something nobody buys.
 */
export function itemCosts(purchased: readonly CostRow[], printed: readonly CostRow[]): Map<string, SupplyCost> {
  const costs = new Map<string, SupplyCost>();
  for (const row of [...purchased, ...printed]) {
    if (!row.inventory_item_id) continue;
    costs.set(row.inventory_item_id, {
      name: row.name ?? 'Insumo',
      costPerUnit: row.cost_per_unit == null ? null : Number(row.cost_per_unit),
    });
  }
  return costs;
}

/**
 * Prices a recipe's supplies per finished unit. An item with no known cost is
 * counted at zero, since inventing a price would be worse, and is listed by
 * name so the screen can say the estimate leaves it out.
 */
export function priceRecipeItems(
  items: RecipeItem[],
  costs: Map<string, SupplyCost>,
): { suppliesPerUnit: { label: string; cost: number }[]; unpriced: string[] } {
  const unpriced: string[] = [];

  const suppliesPerUnit = items.map((item) => {
    const supply = costs.get(item.inventoryItemId);
    const label = supply?.name ?? 'Insumo';

    if (supply?.costPerUnit == null) {
      unpriced.push(label);
      return { label, cost: 0 };
    }
    // Left unrounded on purpose: `calculateBatchCost` rounds each supply once
    // it knows how many units the batch makes, and that is the only place that
    // should touch cents.
    return { label, cost: item.quantityPerUnit * supply.costPerUnit };
  });

  return { suppliesPerUnit, unpriced };
}

/**
 * What a line should cost to make, using the variant's recipe and the current
 * parameters. The maths is the shared `calculateBatchCost`; this only gathers
 * its inputs. Returns null when the variant has no recipe to cost.
 */
@Injectable({ providedIn: 'root' })
export class CostEstimator {
  private readonly supabase = inject(SUPABASE);
  private readonly inputs = inject(CostInputs);

  async forVariant(variantId: string, quantity: number): Promise<CostEstimate | null> {
    if (!Number.isInteger(quantity) || quantity <= 0) return null;

    const [recipe, profile, printers, filamentCosts] = await Promise.all([
      this.recipe(variantId),
      this.inputs.profile(),
      this.inputs.printers(),
      this.inputs.filamentCostPerGram(),
    ]);

    const printer = printers[0];
    if (!recipe || recipe.plates.length === 0 || !printer) return null;

    // The parts its own plates print are already in the plates' cost (H19).
    const items = itemsBeyondPlates(recipe.items, printedByPlates(recipe.plates));
    const supplyCosts = await this.supplyCosts(items);
    const supplies = priceRecipeItems(items, supplyCosts);

    const fallbackPerGram = average([...filamentCosts.values()]);
    const batch: BatchInput = {
      units: quantity,
      setupMinutes: recipe.setupMinutes,
      minutesPerUnit: recipe.minutesPerUnit,
      suppliesPerUnit: supplies.suppliesPerUnit,
      plates: recipe.plates.map((plate) => ({
        label: plate.label,
        printTimeSeconds: plate.printTimeS,
        unitsPerRun: plate.unitsPerRun,
        filaments: plate.filaments.map((filament) => {
          const perGram =
            (filament.skuId ? filamentCosts.get(filament.skuId) : undefined) ?? fallbackPerGram;
          return { grams: filament.grams, costPerKg: perGram * GRAMS_PER_KG };
        }),
      })),
    };

    const cost = calculateBatchCost(batch, profile, printer.profile);
    return { perUnit: cost.costPerUnit, total: cost.total, unpricedSupplies: supplies.unpriced };
  }

  /**
   * Reads the supplies' cost from `inventory_item_costs`, which prefers the
   * last purchase and falls back to the standard cost, and the parts' from
   * `part_stock`. Asking for just the recipe's items keeps this cheap enough
   * to run on every keystroke.
   */
  private async supplyCosts(items: RecipeItem[]): Promise<Map<string, SupplyCost>> {
    const ids = items.map((item) => item.inventoryItemId);
    if (ids.length === 0) return new Map();

    const [purchased, printed] = await Promise.all([
      this.supabase.from('inventory_item_costs').select('inventory_item_id, name, cost_per_unit').in('inventory_item_id', ids),
      this.supabase.from('part_stock').select('inventory_item_id, name, cost_per_unit').in('inventory_item_id', ids),
    ]);
    if (purchased.error) throw purchased.error;
    if (printed.error) throw printed.error;

    return itemCosts(purchased.data, printed.data);
  }

  private async recipe(variantId: string) {
    const { data, error } = await this.supabase
      .from('recipes')
      .select(
        'setup_minutes, minutes_per_unit, recipe_plates(label, units_per_run, print_time_s, recipe_plate_filaments(grams, filament_sku_id), recipe_plate_outputs(inventory_item_id)), recipe_items(inventory_item_id, quantity_per_unit)',
      )
      .eq('variant_id', variantId)
      .eq('active', true)
      .order('version', { ascending: false })
      .limit(1);
    if (error) throw error;

    const row = data[0];
    if (!row) return null;

    return {
      setupMinutes: Number(row.setup_minutes),
      minutesPerUnit: Number(row.minutes_per_unit),
      items: row.recipe_items.map((item) => ({
        inventoryItemId: item.inventory_item_id,
        quantityPerUnit: Number(item.quantity_per_unit),
      })),
      plates: row.recipe_plates.map((plate) => ({
        label: plate.label ?? undefined,
        unitsPerRun: Number(plate.units_per_run),
        printTimeS: plate.print_time_s,
        filaments: plate.recipe_plate_filaments.map((filament) => ({
          grams: Number(filament.grams),
          skuId: filament.filament_sku_id,
        })),
        outputs: plate.recipe_plate_outputs.map((output) => ({ inventoryItemId: output.inventory_item_id })),
      })),
    };
  }
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
