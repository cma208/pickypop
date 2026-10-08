import { TestBed } from '@angular/core/testing';
import { todayLocal } from '../../core/dates';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { CotizadorData } from './cotizador.data';
import { catalogUnitPrice } from './quote-model';

type Row = Record<string, unknown>;

/** Tables that answer `eq`, `neq`, `in` and `lte` the way PostgREST would. */
function tables(rows: Record<string, Row[]>) {
  const supabase = {
    from: (table: string) => {
      let result = [...(rows[table] ?? [])];
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          result = result.filter((row) => row[column] === value);
          return chain;
        },
        neq: (column: string, value: unknown) => {
          result = result.filter((row) => row[column] !== value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          result = result.filter((row) => values.includes(row[column]));
          return chain;
        },
        lte: (column: string, value: string) => {
          result = result.filter((row) => String(row[column]) <= value);
          return chain;
        },
        order: () => chain,
        range: () => chain,
        then: (resolve: (value: unknown) => void) => resolve({ data: result, error: null }),
      };
      return chain;
    },
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: supabase },
      { provide: CurrentWorkspace, useValue: {} },
    ],
  });
  return TestBed.inject(CotizadorData);
}

const TOMORROW = '2999-01-01';

const CATALOG = {
  catalog_products: [
    { id: 'p-skull', name: 'Calavera', status: 'published' },
    { id: 'p-old', name: 'Botella vieja', status: 'archived' },
  ],
  product_variants: [
    { id: 'v-red', product_id: 'p-skull', name: 'Roja', list_price: '12.00', active: true },
    { id: 'v-gold', product_id: 'p-skull', name: 'Dorada', list_price: '15.00', active: false },
    { id: 'v-old', product_id: 'p-old', name: 'Única', list_price: '9.00', active: true },
  ],
  price_tiers: [
    { id: 't1', variant_id: 'v-gold', min_quantity: 10, unit_price: '13.00', valid_from: '2026-09-01' },
    { id: 't2', variant_id: 'v-gold', min_quantity: 10, unit_price: '12.50', valid_from: '2026-10-01' },
    { id: 't3', variant_id: 'v-gold', min_quantity: 20, unit_price: '11.00', valid_from: TOMORROW },
  ],
};

describe('CotizadorData.variantsByIds', () => {
  it('brings a variant switched off with its list price and its ladder in force, not offered', async () => {
    const data = tables(CATALOG);

    const [gold] = await data.variantsByIds(['v-gold']);

    expect(gold).toEqual({
      id: 'v-gold',
      label: 'Calavera · Dorada',
      listPrice: 15,
      tiers: [{ minQuantity: 10, unitPrice: 12.5 }],
      offered: false,
    });
    expect(todayLocal() < TOMORROW).toBe(true);
  });

  it('brings a variant of an archived product too, not offered', async () => {
    const data = tables(CATALOG);

    const [old] = await data.variantsByIds(['v-old']);

    expect(old?.offered).toBe(false);
    expect(old?.listPrice).toBe(9);
  });

  it('asks for nothing when no line uses a variant', async () => {
    const data = tables(CATALOG);

    expect(await data.variantsByIds([])).toEqual([]);
  });

  it('keeps quoting the line by its list price and ladder, not by its cost (T2-01)', async () => {
    const data = tables(CATALOG);
    const [gold] = await data.variantsByIds(['v-gold']);

    expect(catalogUnitPrice(gold ?? null, 2)).toBe(15);
    expect(catalogUnitPrice(gold ?? null, 12)).toBe(12.5);
    // Without it, as before: no catalogue price, so the line went by its cost.
    expect(catalogUnitPrice(null, 2)).toBeNull();
  });
});
