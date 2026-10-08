import { TestBed } from '@angular/core/testing';
import { UserFacingError, friendlyError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { PedidosData, type NewPayment } from './pedidos.data';

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

function dataWith(rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>): PedidosData {
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: { rpc } }] });
  return TestBed.inject(PedidosData);
}

describe('PedidosData.recordPayment', () => {
  it('shows the database refusal word for word', async () => {
    const data = dataWith(async () => ({ error: { code: 'P0001', message: OVERPAYMENT } }));

    const failure = await data.recordPayment(PAYMENT).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserFacingError);
    expect(friendlyError(failure, 'generic')).toBe(OVERPAYMENT);
  });

  it('leaves every other failure to the generic explanation', async () => {
    const data = dataWith(async () => ({ error: { code: '42501', message: 'row-level security' } }));

    const failure = await data.recordPayment(PAYMENT).catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(UserFacingError);
    expect(friendlyError(failure, 'generic')).toContain('No tienes permiso');
  });

  it('sends only what was filled in, so the account decides the method', async () => {
    const calls: Record<string, unknown>[] = [];
    const data = dataWith(async (_name, args) => {
      calls.push(args);
      return { error: null };
    });

    await data.recordPayment({ ...PAYMENT, amount: 10.005 });

    expect(calls[0]).toMatchObject({ p_order_id: 'order-1', p_account_id: 'account-1', p_amount: 10.01 });
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
