import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FinanzasData, type AccountSummary, type PaymentInput, type ReceivableRow } from './finanzas.data';
import { PaymentForm } from './payment-form';

const CASH = {
  id: 'acc-1',
  name: 'Efectivo',
  kind: 'cash',
  active: true,
  openingBalance: 0,
  openingBalanceOn: '2026-09-01',
  defaultPaymentMethod: 'cash',
} as AccountSummary;

function owing(balance: number): ReceivableRow {
  return {
    orderId: 'order-4',
    number: 'ORD-2026-0004',
    customerName: 'Ana',
    customerPhone: null,
    orderedOn: '2026-10-01',
    dueDate: null,
    total: 57.34,
    paid: 57.34 - balance,
    balance,
    lastPaymentAt: null,
    daysOverdue: 0,
  };
}

const LOST = new TypeError('Failed to fetch');

interface Sent {
  payment: PaymentInput;
  key: string;
}

/** The collection form of an order owing S/ 57.34; `answer` decides what each send gets back. */
async function open(answer: (sent: Sent) => Promise<void>, recorded = false) {
  const sent: Sent[] = [];
  const asked: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FinanzasData,
        useValue: {
          paymentCategories: async () => ({ order: null, purchase: null }),
          recordPayment: (payment: PaymentInput, key: string) => {
            sent.push({ payment, key });
            return answer({ payment, key });
          },
          entryRecorded: async (key: string) => {
            asked.push(key);
            return recorded;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PaymentForm);
  fixture.componentRef.setInput('receivable', owing(57.34));
  fixture.componentRef.setInput('allAccounts', [CASH]);
  fixture.componentRef.setInput('allCategories', []);
  const saved: string[] = [];
  fixture.componentInstance.saved.subscribe((message) => saved.push(message));
  await settle(fixture);

  const account = fixture.nativeElement.querySelector('[formcontrolname="accountId"]') as HTMLSelectElement;
  account.value = 'acc-1';
  account.dispatchEvent(new Event('change'));
  await settle(fixture);
  return { fixture, sent, asked, saved };
}

async function settle(fixture: ComponentFixture<PaymentForm>): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function submit(fixture: ComponentFixture<PaymentForm>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
}

const text = (fixture: ComponentFixture<PaymentForm>) =>
  (fixture.nativeElement.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ');

describe('PaymentForm, one collection however many times it is sent', () => {
  it('sends a double click once, with a key', async () => {
    let finish: () => void = () => undefined;
    const { fixture, sent } = await open(() => new Promise<void>((resolve) => (finish = resolve)));

    submit(fixture).click();
    submit(fixture).click();
    finish();
    await settle(fixture);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.key).toMatch(/[0-9a-f-]{36}/);
  });

  it('after a lost answer, asks the book before saying it failed, and counts it if it is there', async () => {
    const { fixture, asked, saved, sent } = await open(() => Promise.reject(LOST), true);

    submit(fixture).click();
    await settle(fixture);

    expect(asked).toEqual([sent[0]?.key]);
    expect(saved).toEqual(['Cobro registrado en el pedido ORD-2026-0004.']);
  });

  it('retried unchanged after a lost answer, goes with the same key', async () => {
    const { fixture, sent } = await open(() => Promise.reject(LOST));

    submit(fixture).click();
    await settle(fixture);
    expect(text(fixture)).toContain('sin cambiar nada');
    submit(fixture).click();
    await settle(fixture);

    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);
  });

  it('changed after a lost answer, is another collection with another key', async () => {
    const { fixture, sent } = await open(() => Promise.reject(LOST));

    submit(fixture).click();
    await settle(fixture);
    const amount = fixture.nativeElement.querySelector('[formcontrolname="amount"]') as HTMLInputElement;
    amount.value = '20';
    amount.dispatchEvent(new Event('input'));
    await settle(fixture);
    submit(fixture).click();
    await settle(fixture);

    expect(sent[1]?.payment.amount).toBe(20);
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
  });

  it('keeps an amount the person typed when the debt is read again', async () => {
    const { fixture } = await open(() => Promise.resolve());
    const amount = fixture.nativeElement.querySelector('[formcontrolname="amount"]') as HTMLInputElement;
    amount.value = '5';
    amount.dispatchEvent(new Event('input'));
    await settle(fixture);

    fixture.componentRef.setInput('receivable', owing(30));
    await settle(fixture);

    expect(amount.value).toBe('5');
  });
});
