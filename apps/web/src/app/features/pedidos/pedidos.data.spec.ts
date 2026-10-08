import { TestBed } from '@angular/core/testing';
import { UserFacingError, friendlyError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { linePrints, PedidosData, sellableVariants, type NewPayment } from './pedidos.data';

const OVERPAYMENT =
  'El cobro excede el saldo del pedido ORD-2026-0001: el total es S/ 150.00, ya se cobró S/ 100.00, queda pendiente S/ 50.00 y se intentó cobrar S/ 60.00.';

const PAYMENT: NewPayment = {
  orderId: 'order-1',
  accountId: 'account-1',
  amount: 60,
  method: null,
  occurredAt: null,
  reference: null,
};

function dataWith(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown; data?: unknown }>,
): PedidosData {
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: { rpc } },
      { provide: CurrentWorkspace, useValue: { requireId: async () => 'ws-1' } },
    ],
  });
  return TestBed.inject(PedidosData);
}

describe('PedidosData.createOrder', () => {
  const ORDER = {
    purpose: 'sale' as const,
    customerId: 'customer-1',
    giftCategoryId: null,
    recipient: null,
    dueDate: null,
    note: null,
    lines: [{ variantId: null, description: 'Llavero', quantity: 3, unitPrice: 4, estimatedUnitCost: 1.5 }],
  };

  it('creates number, order and lines in one call, with the key that makes a double click one order', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const data = dataWith(async (name, args) => {
      calls.push({ name, args });
      return { error: null, data: { id: 'order-9', number: 'ORD-2026-0009' } };
    });

    expect(await data.createOrder(ORDER, 'key-7')).toEqual({ id: 'order-9', number: 'ORD-2026-0009' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('create_order');
    expect(calls[0]!.args).toMatchObject({
      p_workspace_id: 'ws-1',
      p_purpose: 'sale',
      p_customer_id: 'customer-1',
      p_create_key: 'key-7',
      p_lines: [{ variant_id: null, description: 'Llavero', quantity: 3, unit_price: 4, estimated_unit_cost: 1.5 }],
    });
  });

  it('shows the database refusal word for word', async () => {
    const zero = 'La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.';
    const data = dataWith(async () => ({ error: { code: 'P0001', message: zero } }));

    const failure = await data.createOrder(ORDER, 'key-7').catch((error: unknown) => error);

    expect(friendlyError(failure, 'generic')).toBe(zero);
  });
});

describe('linePrints', () => {
  it('counts each line\u2019s prints by state', () => {
    const counts = linePrints([
      { order_line_id: 'l1', status: 'planned' },
      { order_line_id: 'l1', status: 'success' },
      { order_line_id: 'l2', status: 'printing' },
      { order_line_id: null, status: 'planned' },
      { order_line_id: 'l2', status: 'cancelled' },
    ]);
    expect(counts.get('l1')).toEqual({ planned: 1, printing: 0, printed: 1 });
    expect(counts.get('l2')).toEqual({ planned: 0, printing: 1, printed: 0 });
  });
});

describe('sellableVariants', () => {
  it('offers only variants of products still sold, by name (T4-19)', () => {
    const products = new Map([['p1', 'Calavera dulcera']]);
    const variants = [
      { id: 'v2', product_id: 'p1', name: 'Con dulces surtidos', list_price: 19 },
      { id: 'v3', product_id: 'archived', name: 'Vieja', list_price: null },
    ];
    expect(sellableVariants(products, variants)).toEqual([
      { id: 'v2', label: 'Calavera dulcera — Con dulces surtidos', listPrice: 19 },
    ]);
  });
});

describe('PedidosData.recordPayment', () => {
  it('shows the database refusal word for word', async () => {
    const data = dataWith(async () => ({ error: { code: 'P0001', message: OVERPAYMENT } }));

    const failure = await data.recordPayment(PAYMENT, 'key-1').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserFacingError);
    expect(friendlyError(failure, 'generic')).toBe(OVERPAYMENT);
  });

  it('leaves every other failure to the generic explanation', async () => {
    const data = dataWith(async () => ({ error: { code: '42501', message: 'row-level security' } }));

    const failure = await data.recordPayment(PAYMENT, 'key-1').catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(UserFacingError);
    expect(friendlyError(failure, 'generic')).toContain('No tienes permiso');
  });

  it('collects through the function that records a payment once per key (T4-01)', async () => {
    const names: string[] = [];
    const data = dataWith(async (name) => {
      names.push(name);
      return { error: null };
    });

    await data.recordPayment(PAYMENT, 'key-1');

    expect(names).toEqual(['collect_order_payment']);
  });

  it('sends only what was filled in, so the account decides the method', async () => {
    const calls: Record<string, unknown>[] = [];
    const data = dataWith(async (_name, args) => {
      calls.push(args);
      return { error: null };
    });

    await data.recordPayment({ ...PAYMENT, amount: 10.005 }, 'key-1');

    expect(calls[0]).toMatchObject({ p_order_id: 'order-1', p_account_id: 'account-1', p_amount: 10.01, p_payment_key: 'key-1' });
    expect(calls[0]!['p_payment_method']).toBeUndefined();
    expect(calls[0]!['p_reference']).toBeUndefined();
  });
});

describe('PedidosData.deliver', () => {
  const SHORTAGE =
    'No alcanza para entregar. Falta: Tapa impresa (hacen falta 2 y hay 1). Arma o imprime lo que falta, o entrega una parte.';

  it('shows the database refusal word for word', async () => {
    const data = dataWith(async () => ({ error: { code: 'P0001', message: SHORTAGE } }));

    const failure = await data
      .deliver({ orderId: 'order-1', lines: [{ order_line_id: 'line-1', quantity: 2 }], deliveredAt: null, note: null })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserFacingError);
    expect(friendlyError(failure, 'generic')).toBe(SHORTAGE);
  });

  it('sends the lines as given and leaves the date and note to the database when empty', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const data = dataWith(async (name, args) => {
      calls.push({ name, args });
      return { error: null };
    });

    await data.deliver({
      orderId: 'order-1',
      lines: [{ order_line_id: 'line-1', quantity: 2 }],
      deliveredAt: null,
      note: null,
    });

    expect(calls[0]!.name).toBe('deliver_order');
    expect(calls[0]!.args).toMatchObject({ p_order_id: 'order-1', p_lines: [{ order_line_id: 'line-1', quantity: 2 }] });
    expect(calls[0]!.args['p_delivered_at']).toBeUndefined();
    expect(calls[0]!.args['p_note']).toBeUndefined();
  });
});

describe('PedidosData.cancelOrder', () => {
  const PRINTING =
    '«Llavero grande» se está imprimiendo en A1 mini para el pedido ORD-2026-0002, y ya gastó filamento. Ciérrala en la cola de impresión y después cancela el pedido.';

  it('sends the person’s answer and the prints it covers to the database function', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const data = dataWith(async (name, args) => {
      calls.push({ name, args });
      return { error: null };
    });

    await data.cancelOrder('order-1', ['job-1'], false);

    expect(calls).toEqual([
      { name: 'cancel_order', args: { p_order_id: 'order-1', p_seen_prints: ['job-1'], p_cancel_prints: false } },
    ]);
  });

  // With nothing shown there was no question: no answer is made up for it,
  // so the database cannot read one into prints queued meanwhile.
  it('sends no answer when there was nothing to ask', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const data = dataWith(async (name, args) => {
      calls.push({ name, args });
      return { error: null };
    });

    await data.cancelOrder('order-1', [], null);

    expect(calls).toEqual([{ name: 'cancel_order', args: { p_order_id: 'order-1', p_seen_prints: [] } }]);
  });

  it('shows the refusal for a print on the printer word for word', async () => {
    const data = dataWith(async () => ({ error: { code: 'P0001', message: PRINTING } }));

    const failure = await data.cancelOrder('order-1', ['job-1'], true).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserFacingError);
    expect(friendlyError(failure, 'generic')).toBe(PRINTING);
  });
});
