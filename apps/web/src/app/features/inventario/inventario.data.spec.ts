import { TestBed } from '@angular/core/testing';
import { UserFacingError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { InventarioData, type PurchaseDraft, type SpoolSummary } from './inventario.data';

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

interface Recorded {
  rpc: [string, Record<string, unknown>][];
  updates: [string, Record<string, unknown>][];
}

/** A Supabase stand-in: every rpc answers `answer`, and every update returns `rows`. */
function dataWith(answer: Rpc, rows: unknown[] = [{ id: 'x' }]): { data: InventarioData; recorded: Recorded } {
  const recorded: Recorded = { rpc: [], updates: [] };
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      recorded.rpc.push([name, args]);
      return answer(name, args);
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        recorded.updates.push([table, values]);
        const chain = { eq: () => chain, select: async () => ({ data: rows, error: null }) };
        return chain;
      },
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: supabase },
      { provide: CurrentWorkspace, useValue: { requireId: async () => 'workspace-1' } },
    ],
  });
  return { data: TestBed.inject(InventarioData), recorded };
}

const DRAFT: PurchaseDraft = {
  supplierId: null,
  purchasedAt: '2026-10-08',
  documentRef: null,
  shippingCost: 10,
  otherCosts: 0,
  allocation: 'by_amount',
  note: null,
  payment: { accountId: 'cash', method: null },
  lines: [
    { kind: 'sku', targetId: 'sku-1', quantity: 2, unitPrice: 50, extra: 8.7, unitCosts: [54.35, 54.35], unitCost: 54.35, expiresOn: null },
    { kind: 'item', targetId: 'sweets', quantity: 1000, unitPrice: 0.015005, extra: 1.3, unitCosts: [], unitCost: 0.01631, expiresOn: '2027-01-01' },
  ],
};

const RECEIPT = {
  purchase_id: 'purchase-1',
  total: 125.01,
  paid: 125.01,
  pending: 0,
  replayed: false,
  spools: [
    { id: 's1', code: 'PLA-NEGRO-03', material_code: 'PLA', color_name: 'Negro' },
    { id: 's2', code: 'PLA-NEGRO-04', material_code: 'PLA', color_name: 'Negro' },
  ],
};

const SPOOL = { id: 'spool-1', code: 'PLA-PRUEBA-01', status: 'sealed' } as SpoolSummary;

describe('InventarioData.registerPurchase', () => {
  it('sends the whole purchase to one database call, with its key (T1-04, T1-05)', async () => {
    const { data, recorded } = dataWith(async () => ({ data: RECEIPT, error: null }));

    await data.registerPurchase(DRAFT, 'key-1');

    expect(recorded.rpc.map(([name]) => name)).toEqual(['register_purchase']);
    const [, args] = recorded.rpc[0]!;
    expect(args['p_purchase_key']).toBe('key-1');
    expect(args['p_workspace_id']).toBe('workspace-1');
    expect(args['p_account_id']).toBe('cash');
    expect(args['p_lines']).toEqual([
      { filament_sku_id: 'sku-1', quantity: 2, unit_price: 50, allocated_extra_cost: 8.7, unit_costs: [54.35, 54.35] },
      {
        inventory_item_id: 'sweets',
        quantity: 1000,
        unit_price: 0.015005,
        allocated_extra_cost: 1.3,
        unit_cost: 0.01631,
        expires_on: '2027-01-01',
      },
    ]);
  });

  it('lists the rolls with the labels the database gave them', async () => {
    const { data } = dataWith(async () => ({ data: RECEIPT, error: null }));

    const registered = await data.registerPurchase(DRAFT, 'key-1');

    expect(registered).toEqual({
      id: 'purchase-1',
      total: 125.01,
      paid: 125.01,
      spools: [
        { code: 'PLA-NEGRO-03', materialCode: 'PLA', colorName: 'Negro' },
        { code: 'PLA-NEGRO-04', materialCode: 'PLA', colorName: 'Negro' },
      ],
    });
  });

  it('passes the refusal on as it came, for the screen to show it word for word', async () => {
    const refusal = { code: 'P0001', message: 'La cantidad de Dulces va hasta 1000000: revísala.' };
    const { data } = dataWith(async () => ({ data: null, error: refusal }));

    await expect(data.registerPurchase(DRAFT, 'key-1')).rejects.toBe(refusal);
  });
});

describe('InventarioData spools', () => {
  it('changes a state through the database, saying which state the screen showed', async () => {
    const { data, recorded } = dataWith(async () => ({
      data: { status: 'discarded', changed: true, removed_g: 1000, removed_cost: 50 },
      error: null,
    }));

    const change = await data.changeSpoolStatus(SPOOL, 'discarded');

    expect(recorded.rpc[0]).toEqual([
      'set_spool_status',
      { p_spool_id: 'spool-1', p_status: 'discarded', p_expected: 'sealed' },
    ]);
    expect(change).toEqual({ status: 'discarded', changed: true, removedG: 1000, removedCost: 50 });
  });

  it('sends what the scale said, never a difference worked out here (T3-02)', async () => {
    const { data, recorded } = dataWith(async () => ({
      data: { net_g: 0, before_g: 0, difference_g: 0, after_g: 0, status: 'empty' },
      error: null,
    }));

    const result = await data.recordWeighing({ spoolId: 'spool-1', grossG: 200, tareG: 200 });

    expect(recorded.rpc[0]).toEqual([
      'weigh_spool',
      { p_spool_id: 'spool-1', p_gross_g: 200, p_tare_g: 200, p_reopen: false },
    ]);
    expect(result.differenceG).toBe(0);
  });

  it('says a discarded roll comes back only when the person said so', async () => {
    const { data, recorded } = dataWith(async () => ({
      data: { net_g: 650, before_g: 0, difference_g: 650, after_g: 650, status: 'open' },
      error: null,
    }));

    await data.recordWeighing({ spoolId: 'spool-1', grossG: 850, tareG: 200, reopen: true });

    expect(recorded.rpc[0]?.[1]).toEqual({ p_spool_id: 'spool-1', p_gross_g: 850, p_tare_g: 200, p_reopen: true });
  });

  it('does not say «guardado» when the update touched no row', async () => {
    const { data } = dataWith(async () => ({ data: null, error: null }), []);

    await expect(data.updateSpoolLabel('spool-1', 'X-01', null)).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe('InventarioData.recordItemMovement', () => {
  it('sends what was counted, and reads back what the database wrote', async () => {
    const { data, recorded } = dataWith(async () => ({ data: { before: 480, difference: 0, after: 480 }, error: null }));

    const result = await data.recordItemMovement({ itemId: 'sweets', mode: 'count', quantity: 480, reason: null, note: null });

    expect(recorded.rpc[0]).toEqual(['move_item_stock', { p_item_id: 'sweets', p_mode: 'count', p_quantity: 480 }]);
    expect(result).toEqual({ before: 480, difference: 0, after: 480 });
  });
});
