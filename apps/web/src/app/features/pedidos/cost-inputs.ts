import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import type { CostProfile, PrinterProfile } from '../../core/pricing';

const CACHE_MS = 60_000;
const HOURS_PER_YEAR_FALLBACK = 2000;

export interface PrinterCostInputs {
  id: string;
  profile: PrinterProfile;
}

/**
 * The rates the cost formulas need, read from the database. Kept for a minute
 * so a form that recalculates on every keystroke does not hammer the server.
 */
@Injectable({ providedIn: 'root' })
export class CostInputs {
  private readonly supabase = inject(SUPABASE);
  private cache = new Map<string, { at: number; value: Promise<unknown> }>();

  profile(): Promise<CostProfile> {
    return this.remember('profile', () => this.loadProfile());
  }

  printers(): Promise<PrinterCostInputs[]> {
    return this.remember('printers', () => this.loadPrinters());
  }

  /** Weighted cost per gram of every filament SKU with stock. */
  filamentCostPerGram(): Promise<Map<string, number>> {
    return this.remember('filaments', () => this.loadFilamentCosts());
  }

  private remember<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;

    const value = load().catch((error: unknown) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async loadProfile(): Promise<CostProfile> {
    const { data, error } = await this.supabase
      .from('cost_profiles')
      .select(
        'material_waste_rate, failure_rate, labor_rate_per_hour, energy_rate_per_kwh, target_margin, min_order_price, rounding_step, igv_rate',
      )
      .lte('valid_from', new Date().toISOString().slice(0, 10))
      .order('valid_from', { ascending: false })
      .limit(1);
    if (error) throw error;

    const row = data[0];
    if (!row) throw new Error('No cost profile in force');

    return {
      materialWasteRate: Number(row.material_waste_rate),
      failureRate: Number(row.failure_rate),
      laborRatePerHour: Number(row.labor_rate_per_hour),
      energyRatePerKwh: Number(row.energy_rate_per_kwh),
      targetMargin: Number(row.target_margin),
      minOrderPrice: Number(row.min_order_price),
      roundingStep: Number(row.rounding_step),
      igvRate: Number(row.igv_rate),
      taxRegime: 'none',
    };
  }

  private async loadPrinters(): Promise<PrinterCostInputs[]> {
    const { data, error } = await this.supabase
      .from('printers')
      .select('id, name, avg_power_w, maintenance_budget_per_year, expected_hours_per_year, assets(cost, useful_life_hours)')
      .eq('status', 'active');
    if (error) throw error;

    return data.map((printer) => ({
      id: printer.id,
      profile: {
        name: printer.name,
        avgPowerWatts: Number(printer.avg_power_w),
        assetCost: Number(printer.assets?.cost ?? 0),
        usefulLifeHours: Number(printer.assets?.useful_life_hours ?? 0),
        maintenanceCostPerYear: Number(printer.maintenance_budget_per_year),
        printHoursPerYear: Number(printer.expected_hours_per_year) || HOURS_PER_YEAR_FALLBACK,
      },
    }));
  }

  private async loadFilamentCosts(): Promise<Map<string, number>> {
    const { data, error } = await this.supabase
      .from('filament_sku_stock')
      .select('filament_sku_id, weighted_cost_per_gram');
    if (error) throw error;

    const costs = new Map<string, number>();
    for (const row of data) {
      if (row.filament_sku_id && row.weighted_cost_per_gram != null) {
        costs.set(row.filament_sku_id, Number(row.weighted_cost_per_gram));
      }
    }
    return costs;
  }
}
