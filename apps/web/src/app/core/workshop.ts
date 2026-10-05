import { inject, Injectable } from '@angular/core';
import { SUPABASE } from './supabase';

export interface FilamentStock {
  id: string;
  colorName: string;
  colorHex: string | null;
  onHandG: number;
  availableG: number;
  costPerGram: number | null;
  belowMinimum: boolean;
}

export interface CatalogVariant {
  id: string;
  name: string;
  listPrice: number | null;
  tiers: { minQuantity: number; unitPrice: number }[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  status: string;
  leadTimeDays: number | null;
  variants: CatalogVariant[];
}

export interface PrinterSummary {
  id: string;
  name: string;
  model: string | null;
  initialHours: number;
  depreciationPerHour: number;
  maintenancePerHour: number;
  machineRatePerHour: number;
}

/**
 * Reads what the workshop looks like today. Every query goes through Row Level
 * Security, so it returns only the workshops the signed-in person belongs to.
 */
@Injectable({ providedIn: 'root' })
export class Workshop {
  private readonly supabase = inject(SUPABASE);

  async filaments(): Promise<FilamentStock[]> {
    const [skus, stock] = await Promise.all([
      this.supabase.from('filament_skus').select('id, color_name, color_hex'),
      this.supabase
        .from('filament_sku_stock')
        .select('filament_sku_id, on_hand_g, available_g, weighted_cost_per_gram, below_minimum'),
    ]);

    if (skus.error) throw skus.error;
    if (stock.error) throw stock.error;

    const byId = new Map(stock.data.map((row) => [row.filament_sku_id, row]));

    return skus.data
      .map((sku) => {
        const balance = byId.get(sku.id);
        return {
          id: sku.id,
          colorName: sku.color_name,
          colorHex: sku.color_hex,
          onHandG: Number(balance?.on_hand_g ?? 0),
          availableG: Number(balance?.available_g ?? 0),
          costPerGram:
            balance?.weighted_cost_per_gram == null ? null : Number(balance.weighted_cost_per_gram),
          belowMinimum: balance?.below_minimum ?? false,
        };
      })
      .sort((a, b) => a.colorName.localeCompare(b.colorName, 'es'));
  }

  async catalog(): Promise<CatalogProduct[]> {
    const [products, variants, tiers] = await Promise.all([
      this.supabase.from('catalog_products').select('id, name, status, lead_time_days'),
      this.supabase.from('product_variants').select('id, product_id, name, list_price'),
      this.supabase.from('price_tiers').select('variant_id, min_quantity, unit_price'),
    ]);

    if (products.error) throw products.error;
    if (variants.error) throw variants.error;
    if (tiers.error) throw tiers.error;

    return products.data.map((product) => ({
      id: product.id,
      name: product.name,
      status: product.status,
      leadTimeDays: product.lead_time_days,
      variants: variants.data
        .filter((variant) => variant.product_id === product.id)
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          listPrice: variant.list_price == null ? null : Number(variant.list_price),
          tiers: tiers.data
            .filter((tier) => tier.variant_id === variant.id)
            .map((tier) => ({
              minQuantity: tier.min_quantity,
              unitPrice: Number(tier.unit_price),
            }))
            .sort((a, b) => a.minQuantity - b.minQuantity),
        })),
    }));
  }

  async printers(): Promise<PrinterSummary[]> {
    const [printers, rates] = await Promise.all([
      // A retired printer must not be offered when logging a print: the
      // quoting screen already excludes them and the two should agree.
      this.supabase.from('printers').select('id, name, model, initial_hours').neq('status', 'retired'),
      this.supabase
        .from('printer_machine_rates')
        .select('printer_id, depreciation_per_hour, maintenance_per_hour, machine_rate_per_hour'),
    ]);

    if (printers.error) throw printers.error;
    if (rates.error) throw rates.error;

    const byId = new Map(rates.data.map((row) => [row.printer_id, row]));

    return printers.data.map((printer) => {
      const rate = byId.get(printer.id);
      return {
        id: printer.id,
        name: printer.name,
        model: printer.model,
        initialHours: Number(printer.initial_hours),
        depreciationPerHour: Number(rate?.depreciation_per_hour ?? 0),
        maintenancePerHour: Number(rate?.maintenance_per_hour ?? 0),
        machineRatePerHour: Number(rate?.machine_rate_per_hour ?? 0),
      };
    });
  }
}
