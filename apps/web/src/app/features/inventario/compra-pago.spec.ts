import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FinanzasData } from '../finanzas/finanzas.data';
import { CompraPago } from './compra-pago';
import { InventarioData, type PaymentAccount, type PurchasePaymentInput, type PurchaseSummary } from './inventario.data';

const PURCHASE: PurchaseSummary = {
  id: 'purchase-1',
  supplierName: null,
  purchasedAt: '2026-10-01',
  documentRef: null,
  shippingCost: 0,
  otherCosts: 0,
  allocation: 'by_amount',
  note: null,
  total: 170,
  paid: 0,
  pending: 170,
  spoolCount: 0,
  lines: [],
};

const CASH: PaymentAccount = { id: 'cash', name: 'Efectivo', defaultMethod: 'cash', openingBalanceOn: '2026-01-01' };

type Call = [input: PurchasePaymentInput, key: string];

interface Opened {
  fixture: ComponentFixture<CompraPago>;
  calls: Call[];
  paid: number;
  refused: number;
}

function open(record: () => Promise<void>): Opened {
  const calls: Call[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
      {
        provide: InventarioData,
        useValue: {
          recordPurchasePayment: async (input: PurchasePaymentInput, key: string) => {
            calls.push([input, key]);
            await record();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CompraPago);
  fixture.componentRef.setInput('purchase', PURCHASE);
  fixture.componentRef.setInput('accounts', [CASH]);
  const opened: Opened = { fixture, calls, paid: 0, refused: 0 };
  fixture.componentInstance.paid.subscribe(() => opened.paid++);
  fixture.componentInstance.refused.subscribe(() => opened.refused++);
  fixture.detectChanges();
  return opened;
}

/** The protected form and submit, as the template reaches them. */
interface Internals {
  form: { controls: Record<'accountId' | 'amount' | 'occurredAt', { setValue(value: unknown): void }> };
  submit(): Promise<void>;
}

const internals = (fixture: ComponentFixture<CompraPago>) => fixture.componentInstance as unknown as Internals;
const form = (fixture: ComponentFixture<CompraPago>) => internals(fixture).form;
const submit = (fixture: ComponentFixture<CompraPago>) => internals(fixture).submit();

const text = (fixture: ComponentFixture<CompraPago>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Types into the amount the way a person does: the control ends up dirty. */
function typeAmount(fixture: ComponentFixture<CompraPago>, value: number): void {
  const input = fixture.nativeElement.querySelector('input[formcontrolname="amount"]') as HTMLInputElement;
  input.value = String(value);
  input.dispatchEvent(new Event('input'));
}

const amountOf = (fixture: ComponentFixture<CompraPago>) =>
  (internals(fixture).form.controls.amount as unknown as { value: number | null }).value;

/** What the list hands over after reloading: always a new object. */
function reload(fixture: ComponentFixture<CompraPago>, pending: number): void {
  fixture.componentRef.setInput('purchase', { ...PURCHASE, paid: PURCHASE.total - pending, pending });
  fixture.detectChanges();
}

describe('CompraPago', () => {
  it('pays once when «Registrar pago» is clicked twice in a row (T1-01)', async () => {
    let finish: () => void = () => undefined;
    const opened = open(() => new Promise<void>((resolve) => (finish = resolve)));
    form(opened.fixture).controls.accountId.setValue('cash');
    form(opened.fixture).controls.amount.setValue(10);

    const first = submit(opened.fixture);
    const second = submit(opened.fixture);
    finish();
    await Promise.all([first, second]);

    expect(opened.calls.length).toBe(1);
    expect(opened.calls[0]?.[0].amount).toBe(10);
    expect(opened.paid).toBe(1);
  });

  it('asks again with the same key when the answer was lost, and with a new one after it went through', async () => {
    let fail = true;
    const opened = open(async () => {
      if (fail) throw new Error('Failed to fetch');
    });
    form(opened.fixture).controls.accountId.setValue('cash');
    form(opened.fixture).controls.amount.setValue(10);

    await submit(opened.fixture);
    fail = false;
    await submit(opened.fixture);
    await submit(opened.fixture);

    const keys = opened.calls.map(([, key]) => key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(opened.refused).toBe(1);
    expect(opened.paid).toBe(2);
  });

  it('refuses a payment dated in the future before asking the database (T1-09)', async () => {
    const { fixture, calls } = open(async () => undefined);
    form(fixture).controls.accountId.setValue('cash');
    form(fixture).controls.occurredAt.setValue('2099-03-15T10:00');

    await submit(fixture);
    fixture.detectChanges();

    expect(calls.length).toBe(0);
    expect(text(fixture)).toContain('La fecha no puede ser futura');
  });

  it('says the minimum in soles instead of «mayor que cero» (T1-24)', async () => {
    const { fixture, calls } = open(async () => undefined);
    form(fixture).controls.accountId.setValue('cash');
    form(fixture).controls.amount.setValue(0.001);

    await submit(fixture);
    fixture.detectChanges();

    expect(calls.length).toBe(0);
    expect(text(fixture)).toContain('El monto mínimo es S/ 0.01.');
  });

  it('does not offer to pay more than is owed', async () => {
    const { fixture, calls } = open(async () => undefined);
    form(fixture).controls.accountId.setValue('cash');
    form(fixture).controls.amount.setValue(200);

    await submit(fixture);
    fixture.detectChanges();

    expect(calls.length).toBe(0);
    expect(text(fixture)).toContain('No puede pasar de lo que falta');
  });

  it('keeps the typed amount and its key when the list reloads after a refusal', async () => {
    const refusal = { code: 'P0001', message: 'La cuenta Yape está desactivada.' };
    let refuse = true;
    const opened = open(async () => {
      if (refuse) throw refusal;
    });
    form(opened.fixture).controls.accountId.setValue('cash');
    typeAmount(opened.fixture, 10);

    await submit(opened.fixture);
    // compras.page reloads the list: same purchase, new object, same debt.
    reload(opened.fixture, 170);
    expect(amountOf(opened.fixture)).toBe(10);
    expect(opened.fixture.nativeElement.textContent).toContain('La cuenta Yape está desactivada.');

    refuse = false;
    await submit(opened.fixture);

    expect(opened.calls.map(([input]) => input.amount)).toEqual([10, 10]);
    expect(opened.calls[1]?.[1]).toBe(opened.calls[0]?.[1]);
  });

  it('says it does not know when the answer was lost, and retries the same payment with the same key (T1-01)', async () => {
    let lose = true;
    const opened = open(async () => {
      // What postgrest-js returns when fetch throws: an empty code.
      if (lose) throw { code: '', message: 'TypeError: Failed to fetch' };
    });
    form(opened.fixture).controls.accountId.setValue('cash');
    typeAmount(opened.fixture, 10);

    await submit(opened.fixture);
    opened.fixture.detectChanges();
    expect(text(opened.fixture)).toContain('No sabemos si el pago se registró');
    expect(text(opened.fixture)).not.toContain('No pudimos registrar el pago');

    // The payment had gone in: the reload says 160 are left. The 10 stays.
    reload(opened.fixture, 160);
    expect(amountOf(opened.fixture)).toBe(10);

    lose = false;
    await submit(opened.fixture);

    expect(opened.calls.map(([input]) => input.amount)).toEqual([10, 10]);
    expect(opened.calls[1]?.[1]).toBe(opened.calls[0]?.[1]);
  });

  it('follows what is owed while nothing was typed, and again after a payment went through', async () => {
    const opened = open(async () => undefined);
    expect(amountOf(opened.fixture)).toBe(170);

    reload(opened.fixture, 150);
    expect(amountOf(opened.fixture)).toBe(150);

    form(opened.fixture).controls.accountId.setValue('cash');
    typeAmount(opened.fixture, 50);
    await submit(opened.fixture);
    reload(opened.fixture, 100);

    expect(amountOf(opened.fixture)).toBe(100);
  });

  it('locks the payment while it is on its way: an amount changed then does not get a new key (review)', async () => {
    let lose: () => void = () => undefined;
    let first = true;
    const opened = open(() => {
      if (!first) return Promise.resolve();
      first = false;
      return new Promise<void>((_, reject) => (lose = () => reject({ code: '', message: 'TypeError: Failed to fetch' })));
    });
    form(opened.fixture).controls.accountId.setValue('cash');
    typeAmount(opened.fixture, 10);

    const sending = submit(opened.fixture);
    opened.fixture.detectChanges();
    expect((opened.fixture.nativeElement as HTMLElement).querySelector('fieldset')?.disabled).toBe(true);
    // What the locked fieldset stops a person from doing, done anyway.
    form(opened.fixture).controls.amount.setValue(20);
    lose();
    await sending;
    opened.fixture.detectChanges();
    expect(text(opened.fixture)).toContain('No sabemos si el pago se registró');
    expect((opened.fixture.nativeElement as HTMLElement).querySelector('fieldset')?.disabled).toBe(true);

    await submit(opened.fixture);

    expect(opened.calls.length).toBe(2);
    expect(opened.calls[1]?.[1]).toBe(opened.calls[0]?.[1]);
    expect(opened.paid).toBe(1);
  });

  it('retries a payment whose answer was lost even if the reload says less is owed, and lets the database judge it', async () => {
    let lose = true;
    const opened = open(async () => {
      if (lose) throw { code: '', message: 'TypeError: Failed to fetch' };
    });
    form(opened.fixture).controls.accountId.setValue('cash');
    typeAmount(opened.fixture, 170);

    await submit(opened.fixture);
    // Another tab paid 50 meanwhile: 170 is now more than what is owed.
    reload(opened.fixture, 120);
    lose = false;
    await submit(opened.fixture);

    expect(opened.calls.length).toBe(2);
    expect(opened.calls[1]?.[1]).toBe(opened.calls[0]?.[1]);
  });
});
