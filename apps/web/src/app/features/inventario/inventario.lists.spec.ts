import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { InventarioData } from './inventario.data';

/** Tables served the way PostgREST serves them: never more than 1000 rows at a time. */
function pagedSupabase(tables: Record<string, unknown[]>) {
  const ranges: [string, number, number][] = [];
  const supabase = {
    from: (table: string) => {
      const rows = tables[table] ?? [];
      let window: [number, number] = [0, 999];
      const chain = {
        select: () => chain,
        order: () => chain,
        range: (from: number, to: number) => {
          ranges.push([table, from, to]);
          window = [from, Math.min(to, from + 999)];
          return chain;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: rows.slice(window[0], window[1] + 1), error: null }),
      };
      return chain;
    },
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: supabase },
      { provide: CurrentWorkspace, useValue: { requireId: async () => 'workspace-1' } },
    ],
  });
  return { data: TestBed.inject(InventarioData), ranges };
}

describe('InventarioData long lists', () => {
  it('reads every roll, past the 1000 rows PostgREST answers at once', async () => {
    const spools = Array.from({ length: 1500 }, (_, index) => ({
      id: `spool-${index}`,
      code: `PLA-${index}`,
      filament_sku_id: 'sku-1',
      status: 'open',
      location: null,
      opened_at: null,
      initial_weight_g: 1000,
      unit_cost: 50,
      cost_per_gram: 0.05,
      filament_skus: { color_name: 'Negro', color_hex: null, spool_tare_g: null },
    }));
    const balances = spools.map((spool) => ({ spool_id: spool.id, on_hand_g: 400 }));
    const { data } = pagedSupabase({ spools, spool_balances: balances, filament_sku_details: [] });

    const read = await data.spools();

    expect(read).toHaveLength(1500);
    expect(read.every((spool) => spool.remainingG === 400)).toBe(true);
  });

  it('reads every purchase, past the 1000 rows PostgREST answers at once', async () => {
    const purchases = Array.from({ length: 1200 }, (_, index) => ({
      id: `purchase-${index}`,
      purchased_at: '2026-10-01',
      document_ref: null,
      shipping_cost: 0,
      other_costs: 0,
      allocation: 'by_amount',
      note: null,
      suppliers: null,
      purchase_lines: [],
    }));
    const { data, ranges } = pagedSupabase({
      purchases,
      purchase_payment_status: [],
      inventory_items: [],
      filament_sku_details: [],
    });

    const read = await data.purchases();

    expect(read).toHaveLength(1200);
    expect(ranges.filter(([table]) => table === 'purchases')).toEqual([
      ['purchases', 0, 999],
      ['purchases', 1000, 1999],
    ]);
  });

  it('reads every article with its cost, past the 1000 rows PostgREST answers at once', async () => {
    const items = Array.from({ length: 1100 }, (_, index) => ({
      id: `item-${String(index).padStart(4, '0')}`,
      kind: 'packaging',
      name: `Bolsa ${index}`,
      unit: 'unidad',
      image_path: null,
      min_stock: 0,
      perishable: false,
      note: null,
      active: true,
    }));
    const balances = items.map((item) => ({ inventory_item_id: item.id, on_hand: 3 }));
    const costs = items.map((item, index) =>
      index === 1050
        ? { inventory_item_id: item.id, cost_per_unit: null, cost_source: 'unknown', last_purchase_cost: null, standard_cost: null }
        : { inventory_item_id: item.id, cost_per_unit: 0.8, cost_source: 'purchase', last_purchase_cost: 0.8, standard_cost: 0.5 },
    );
    const { data, ranges } = pagedSupabase({ inventory_items: items, inventory_balances: balances, inventory_item_costs: costs });

    const read = await data.items();

    expect(read).toHaveLength(1100);
    expect(ranges.filter(([table]) => table === 'inventory_item_costs')).toEqual([
      ['inventory_item_costs', 0, 999],
      ['inventory_item_costs', 1000, 1999],
    ]);
    const last = read.find((item) => item.id === 'item-1099');
    expect(last).toMatchObject({ onHand: 3, costPerUnit: 0.8, costSource: 'purchase', lastPurchaseCost: 0.8, standardCost: 0.5 });
    expect(read.find((item) => item.id === 'item-1050')).toMatchObject({ costPerUnit: null, costSource: 'unknown' });
  });
});
