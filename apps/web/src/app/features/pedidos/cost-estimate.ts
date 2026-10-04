import { inject, Injectable } from '@angular/core';
import { calculateBatchCost, type BatchInput } from '../../core/pricing';
import { SUPABASE } from '../../core/supabase';
import { CostInputs } from './cost-inputs';

const GRAMS_PER_KG = 1000;

export interface CostEstimate {
  perUnit: number;
  total: number;
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

    const [recipe, profile, printers, filamentCosts, supplyCosts] = await Promise.all([
      this.recipe(variantId),
      this.inputs.profile(),
      this.inputs.printers(),
      this.inputs.filamentCostPerGram(),
      this.inputs.supplyCostPerUnit(),
    ]);

    const printer = printers[0];
    if (!recipe || recipe.plates.length === 0 || !printer) return null;

    const fallbackPerGram = average([...filamentCosts.values()]);
    const batch: BatchInput = {
      units: quantity,
      setupMinutes: recipe.setupMinutes,
      minutesPerUnit: recipe.minutesPerUnit,
      suppliesPerUnit: recipe.items.map((item) => ({
        cost: item.quantityPerUnit * (supplyCosts.get(item.inventoryItemId) ?? 0),
      })),
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
    return { perUnit: cost.costPerUnit, total: cost.total };
  }

  private async recipe(variantId: string) {
    const { data, error } = await this.supabase
      .from('recipes')
      .select(
        'setup_minutes, minutes_per_unit, recipe_plates(label, units_per_run, print_time_s, recipe_plate_filaments(grams, filament_sku_id)), recipe_items(inventory_item_id, quantity_per_unit)',
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
      })),
    };
  }
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
