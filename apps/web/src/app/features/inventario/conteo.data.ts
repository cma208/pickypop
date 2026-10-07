import { inject, Injectable } from '@angular/core';
import { fetchAll } from '../../core/fetch-all';
import { SUPABASE } from '../../core/supabase';
import type { CountEntry, CountKind, CountRow } from './conteo';

@Injectable({ providedIn: 'root' })
export class ConteoData {
  private readonly supabase = inject(SUPABASE);

  /** Products first, then parts, each by name: the order a person walks the shelf. */
  async rows(): Promise<CountRow[]> {
    const data = await fetchAll((from, to) =>
      this.supabase
        .from('shelf_count_items')
        .select('kind, inventory_item_id, variant_id, name, detail, image_path, on_hand, cost_per_unit')
        .order('kind', { ascending: false })
        .order('name')
        .order('detail')
        .range(from, to),
    );

    return data.map((row) => {
      const onHand = Number(row.on_hand ?? 0);
      return {
        kind: (row.kind ?? 'part') as CountKind,
        inventoryItemId: row.inventory_item_id,
        variantId: row.variant_id,
        name: row.name ?? '',
        detail: row.detail,
        imagePath: row.image_path,
        onHand,
        knownCost: row.cost_per_unit === null ? null : Number(row.cost_per_unit),
        counted: onHand,
        typedCost: null,
      };
    });
  }

  /**
   * Saves through the database rule, which compares against what is on the
   * shelf at this moment and writes only the differences. Its refusals say
   * which article and why; `friendlyError` shows them as they are.
   */
  async save(entries: CountEntry[], note: string | null): Promise<number> {
    const { data, error } = await this.supabase.rpc('count_shelf', {
      p_counts: entries,
      p_note: note ?? undefined,
    });
    if (error) throw error;
    return data;
  }
}
