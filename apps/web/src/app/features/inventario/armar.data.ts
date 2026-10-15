import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import { toCostSource, type SupplyCostSource } from '../cotizador/supply-costs';

/**
 * «Armar», sent once. The assembly travels with the key of its submission:
 * the same key again (a retry after the answer was lost on the workshop's
 * Wi-Fi) gets back what was assembled the first time, and nothing moves
 * twice (`assemble_product`, 20261024150000).
 */
@Injectable({ providedIn: 'root' })
export class ArmarData {
  private readonly supabase = inject(SUPABASE);

  async assemble(variantId: string, units: number, requestKey: string): Promise<void> {
    const { error } = await this.supabase.rpc('assemble_product', {
      p_variant_id: variantId,
      p_units: units,
      p_request_key: requestKey,
    });
    if (error) throw error;
  }

  /**
   * Where the cost of each bought component comes from, read from the view
   * `assemble_product` itself values them with, so the warning and the
   * assembly cannot disagree. The ids are one recipe's components, a handful,
   * far from the 1000 rows where PostgREST truncates.
   */
  async costSources(itemIds: readonly string[]): Promise<Map<string, SupplyCostSource>> {
    if (itemIds.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('inventory_item_costs')
      .select('inventory_item_id, cost_source')
      .in('inventory_item_id', [...itemIds]);
    if (error) throw error;

    return new Map(
      (data ?? []).flatMap((row) =>
        row.inventory_item_id ? [[row.inventory_item_id, toCostSource(row.cost_source)] as const] : [],
      ),
    );
  }
}
