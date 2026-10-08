import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserFacingError } from '../../core/friendly-error';
import { FinanzasData } from '../finanzas/finanzas.data';
import { PedidoCobro } from './pedido-cobro';
import { PedidosData, type NewPayment, type PaymentSummary } from './pedidos.data';
import { workspaceAs } from '../../core/workspace.testing';

const OWED: PaymentSummary = { total: 12.99, paid: 0, balance: 12.99, paymentStatus: 'unpaid', lastPaymentAt: null };
const CASH = { id: 'cash', name: 'Efectivo', defaultMethod: 'cash' as const, openingBalanceOn: '2026-09-01' };

interface Opened {
  fixture: ComponentFixture<PedidoCobro>;
  calls: [NewPayment, string][];
  /** The database answers the call in flight: done, or with this failure. */
  finish: (failure?: unknown) => void;
  /** Keys asked about after a lost answer. */
  asked: string[];
  events: string[];
}

/** The database answers only when `finish` is called: a second click arrives while it is still busy. */
async function open(summary: PaymentSummary = OWED, recorded = false): Promise<Opened> {
  const calls: [NewPayment, string][] = [];
  const asked: string[] = [];
  const events: string[] = [];
  let finish: (failure?: unknown) => void = () => {};
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      workspaceAs('operator'),
      { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
      {
        provide: PedidosData,
        useValue: {
          paymentAccounts: async () => [CASH],
          recordPayment: (payment: NewPayment, key: string) => {
            calls.push([payment, key]);
            return new Promise<void>((resolve, reject) => (finish = (failure) => (failure ? reject(failure) : resolve())));
          },
          paymentRecorded: async (key: string) => {
            asked.push(key);
            return recorded;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PedidoCobro);
  fixture.componentRef.setInput('orderId', 'order-3');
  fixture.componentRef.setInput('summary', summary);
  fixture.componentInstance.collected.subscribe(() => events.push('collected'));
  fixture.componentInstance.stale.subscribe(() => events.push('stale'));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, calls, finish: (failure) => finish(failure), asked, events };
}

/** The page read the order again: a new summary object, as `payment()` hands it over. */
async function readAgain(fixture: ComponentFixture<PedidoCobro>, summary: PaymentSummary): Promise<void> {
  fixture.componentRef.setInput('summary', { ...summary });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const LOST = { code: '', message: 'TypeError: Failed to fetch' };

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

  it('keeps the amount typed, and its key, when a refusal reads the order again', async () => {
    const { fixture, calls, finish, events } = await open();
    set(fixture, 'accountId', 'cash');
    set(fixture, 'amount', '5');

    submit(fixture);
    finish(new UserFacingError('La cuenta Plin está desactivada: elige otra.'));
    await fixture.whenStable();
    await readAgain(fixture, OWED);

    expect(events).toEqual(['stale']);
    expect(field(fixture, 'amount').value).toBe('5');
    expect(text(fixture)).toContain('La cuenta Plin está desactivada: elige otra.');

    submit(fixture);
    finish();
    await fixture.whenStable();
    expect(calls[1]![0].amount).toBe(5);
    expect(calls[1]![1]).toBe(calls[0]![1]);
  });

  it('asks by its key after a lost answer, and a payment that was saved is said as done', async () => {
    const { fixture, calls, finish, asked, events } = await open(OWED, true);
    set(fixture, 'accountId', 'cash');
    set(fixture, 'amount', '5');

    submit(fixture);
    finish(LOST);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(asked).toEqual([calls[0]![1]]);
    expect(events).toEqual(['collected']);
    expect(text(fixture)).toContain('Cobro registrado.');
  });

  it('after a lost answer that was not saved, says to send it unchanged, and the retry keeps the key even when the balance moved', async () => {
    const { fixture, calls, finish } = await open();
    set(fixture, 'accountId', 'cash');
    set(fixture, 'amount', '5');

    submit(fixture);
    finish(LOST);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Vuelve a tocar «Registrar cobro» sin cambiar nada');

    // Another tab collected 3 meanwhile: the balance shrinks, the 5 typed stays.
    await readAgain(fixture, { ...OWED, paid: 3, balance: 9.99, paymentStatus: 'partial' });
    expect(field(fixture, 'amount').value).toBe('5');

    submit(fixture);
    finish();
    await fixture.whenStable();
    expect(calls).toHaveLength(2);
    expect(calls[1]![1]).toBe(calls[0]![1]);
  });

  it('proposes what is left once a payment went through', async () => {
    const { fixture, finish } = await open();
    set(fixture, 'accountId', 'cash');
    set(fixture, 'amount', '5');

    submit(fixture);
    finish();
    await fixture.whenStable();
    await readAgain(fixture, { ...OWED, paid: 5, balance: 7.99, paymentStatus: 'partial' });

    expect(field(fixture, 'amount').value).toBe('7.99');
  });
});
