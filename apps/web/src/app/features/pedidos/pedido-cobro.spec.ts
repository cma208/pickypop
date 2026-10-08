import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FinanzasData } from '../finanzas/finanzas.data';
import { PedidoCobro } from './pedido-cobro';
import { PedidosData, type NewPayment, type PaymentSummary } from './pedidos.data';

const OWED: PaymentSummary = { total: 12.99, paid: 0, balance: 12.99, paymentStatus: 'unpaid', lastPaymentAt: null };
const CASH = { id: 'cash', name: 'Efectivo', defaultMethod: 'cash' as const, openingBalanceOn: '2026-09-01' };

interface Opened {
  fixture: ComponentFixture<PedidoCobro>;
  calls: [NewPayment, string][];
  finish: () => void;
}

/** The database answers only when `finish` is called: a second click arrives while it is still busy. */
async function open(summary: PaymentSummary = OWED): Promise<Opened> {
  const calls: [NewPayment, string][] = [];
  let finish = () => {};
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
      {
        provide: PedidosData,
        useValue: {
          paymentAccounts: async () => [CASH],
          recordPayment: (payment: NewPayment, key: string) => {
            calls.push([payment, key]);
            return new Promise<void>((resolve) => (finish = resolve));
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PedidoCobro);
  fixture.componentRef.setInput('orderId', 'order-3');
  fixture.componentRef.setInput('summary', summary);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, calls, finish: () => finish() };
}

function field(fixture: ComponentFixture<PedidoCobro>, name: string): HTMLInputElement & HTMLSelectElement {
  return fixture.nativeElement.querySelector(`[formcontrolname="${name}"]`);
}

function set(fixture: ComponentFixture<PedidoCobro>, name: string, value: string): void {
  const control = field(fixture, name);
  control.value = value;
  control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input'));
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<PedidoCobro>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

function submit(fixture: ComponentFixture<PedidoCobro>): void {
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
}

describe('PedidoCobro', () => {
  it('sends one payment for a double click, with its key (T4-01)', async () => {
    const { fixture, calls, finish } = await open();
    set(fixture, 'accountId', 'cash');
    set(fixture, 'amount', '5');

    submit(fixture);
    submit(fixture);
    finish();
    await fixture.whenStable();

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatchObject({ orderId: 'order-3', accountId: 'cash', amount: 5 });
    expect(calls[0]![1]).toMatch(/[0-9a-f-]{36}/);
  });

  it('does not take a date in the future (T4-06)', async () => {
    const { fixture, calls } = await open();
    set(fixture, 'accountId', 'cash');
    set(fixture, 'occurredAt', '2099-01-15T12:00');

    submit(fixture);
    fixture.detectChanges();

    expect(calls).toEqual([]);
    expect(text(fixture)).toContain('El cobro no puede tener fecha futura');
  });

  it('does not take more than what is owed', async () => {
    const { fixture, calls } = await open();
    set(fixture, 'accountId', 'cash');
    set(fixture, 'amount', '1000000000');

    submit(fixture);
    fixture.detectChanges();

    expect(calls).toEqual([]);
    expect(text(fixture)).toContain('No puede pasar del saldo pendiente');
  });

  it('says a sale of S/ 0 has nothing to collect, not «Sin cobrar» and «cobrado» at once (T4-16)', async () => {
    const { fixture } = await open({ total: 0, paid: 0, balance: 0, paymentStatus: 'unpaid', lastPaymentAt: null });

    expect(text(fixture)).toContain('no hay nada que cobrar');
    expect(text(fixture)).not.toContain('Sin cobrar');
    expect(text(fixture)).not.toContain('cobrado por completo');
  });
});
