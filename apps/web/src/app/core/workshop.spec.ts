import { TestBed } from '@angular/core/testing';
import { todayLocal } from './dates';
import { SUPABASE } from './supabase';
import { tiersInForce, Workshop } from './workshop';

describe('tiersInForce', () => {
  it('keeps the newest row of each minimum, as price_for_quantity does', () => {
    const tiers = tiersInForce([
      { min_quantity: 10, unit_price: '9.00', valid_from: '2026-09-01' },
      { min_quantity: 10, unit_price: '8.50', valid_from: '2026-10-01' },
      { min_quantity: 3, unit_price: 11, valid_from: '2026-09-01' },
    ]);

    expect(tiers).toEqual([
      { minQuantity: 3, unitPrice: 11 },
      { minQuantity: 10, unitPrice: 8.5 },
    ]);
  });
});

describe('Workshop.catalog', () => {
  it('asks only for the steps already started on the workshop day', async () => {
    const filters: { table: string; column: string; value: unknown }[] = [];
    const rows: Record<string, unknown[]> = {
      catalog_products: [{ id: 'p1', name: 'Calavera', status: 'published', lead_time_days: null }],
      product_variants: [{ id: 'v1', product_id: 'p1', name: 'Roja', list_price: '12.00' }],
      price_tiers: [{ variant_id: 'v1', min_quantity: 5, unit_price: '10.00', valid_from: '2026-10-01' }],
    };
    const supabase = {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          lte: (column: string, value: unknown) => {
            filters.push({ table, column, value });
            return chain;
          },
          then: (resolve: (value: unknown) => void) => resolve({ data: rows[table], error: null }),
        };
        return chain;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: supabase }] });

    const catalog = await TestBed.inject(Workshop).catalog();

    expect(filters).toEqual([{ table: 'price_tiers', column: 'valid_from', value: todayLocal() }]);
    expect(catalog[0]?.variants[0]?.tiers).toEqual([{ minQuantity: 5, unitPrice: 10 }]);
  });
});
