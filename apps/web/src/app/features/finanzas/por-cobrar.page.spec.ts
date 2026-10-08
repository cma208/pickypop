import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { UserFacingError } from '../../core/friendly-error';
import { FinanzasData, type AccountSummary, type ReceivableRow } from './finanzas.data';
import type { FinanceAccess } from './finanzas.models';
import { PorCobrarPage } from './por-cobrar.page';

const CASH: AccountSummary = {
  id: 'acc-1',
  name: 'Efectivo',
  kind: 'cash',
  active: true,
  openingBalance: 0,
  openingBalanceOn: '2026-09-01',
  defaultPaymentMethod: 'cash',
  note: null,
  updatedAt: '2026-09-01T15:00:00+00:00',
  totalIn: 0,
  totalOut: 0,
  balance: 0,
  movements: 0,
  lastMovementAt: null,
  movementsBeforeOpening: 0,
  netBeforeOpening: 0,
};

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

const OVERPAYMENT =
  'El cobro excede el saldo del pedido ORD-2026-0004: el total es S/ 57.34, ya se cobró S/ 50.00, queda pendiente S/ 7.34 y se intentó cobrar S/ 57.34.';

/**
 * Por cobrar with one order owing S/ 57.34. Another tab collects part of it
 * (or all of it) while this one has the form open: what the list reads the
 * second time is `after`.
 */
async function open(
  after: ReceivableRow[],
  access: FinanceAccess = { isOwner: false, canOperate: true },
): Promise<ComponentFixture<PorCobrarPage>> {
  let reads = 0;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FinanzasData,
        useValue: {
          access: async () => access,
          accounts: async () => [CASH],
          categories: async () => [],
          paymentCategories: async () => ({ order: null, purchase: null }),
          receivables: async () => (reads++ === 0 ? [owing(57.34)] : after),
          recordPayment: async () => {
            throw new UserFacingError(OVERPAYMENT);
          },
        },
      },
    ],
  });
  // The form scrolls itself into view, which jsdom does not draw.
  Element.prototype.scrollIntoView = () => undefined;

  const fixture = TestBed.createComponent(PorCobrarPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<PorCobrarPage>): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const text = (fixture: ComponentFixture<PorCobrarPage>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

async function press(fixture: ComponentFixture<PorCobrarPage>, label: string): Promise<void> {
  const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`no button «${label}» among ${buttons.map((b) => b.textContent?.trim()).join(', ')}`);
  button.click();
  await settle(fixture);
}

function field<T extends HTMLElement>(fixture: ComponentFixture<PorCobrarPage>, name: string): T {
  const element = fixture.nativeElement.querySelector(`[formcontrolname="${name}"]`) as T | null;
  if (!element) throw new Error(`no field «${name}»`);
  return element;
}

/** Opens «Cobrar», picks the account and sends what the form proposes: the whole debt. */
async function collectAll(fixture: ComponentFixture<PorCobrarPage>): Promise<void> {
  await press(fixture, 'Cobrar');
  const account = field<HTMLSelectElement>(fixture, 'accountId');
  account.value = 'acc-1';
  account.dispatchEvent(new Event('change'));
  await settle(fixture);
  await press(fixture, 'Registrar cobro');
}

describe('PorCobrarPage after a refused collection', () => {
  it('keeps the form on its order with what it owes now, and the refusal in view', async () => {
    const fixture = await open([owing(7.34)]);

    await collectAll(fixture);

    expect(text(fixture)).toContain(OVERPAYMENT);
    expect(text(fixture)).toContain('pendiente S/ 7.34');
    expect(field<HTMLInputElement>(fixture, 'amount').value).toBe('7.34');
  });

  it('closes the form of an order that no longer owes, and says why on the page', async () => {
    const fixture = await open([]);

    await collectAll(fixture);

    expect(fixture.nativeElement.querySelector('app-payment-form')).toBeNull();
    expect(text(fixture)).toContain(OVERPAYMENT);
    expect(text(fixture)).toContain('El pedido ORD-2026-0004 ya no tiene nada por cobrar');
  });
});

describe('PorCobrarPage for a viewer', () => {
  it('lists what is owed without offering «Cobrar», and says whose it is', async () => {
    const fixture = await open([], { isOwner: false, canOperate: false });

    const labels = Array.from(fixture.nativeElement.querySelectorAll('button')).map((button) =>
      (button as HTMLButtonElement).textContent?.trim(),
    );
    expect(labels).not.toContain('Cobrar');
    expect(text(fixture)).toContain('ORD-2026-0004');
    expect(text(fixture)).toContain('Tu rol en el taller es de consulta');
  });
});
