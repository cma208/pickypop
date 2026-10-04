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
