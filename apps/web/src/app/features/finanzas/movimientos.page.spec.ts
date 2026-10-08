import type { Provider } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { isPermissionError, UserFacingError } from '../../core/friendly-error';
import { FinanzasData, type AccountSummary, type LedgerRow } from './finanzas.data';
import { CurrentWorkspace, type MemberRole } from '../../core/workspace';
import { fakeWorkspace, workspaceAs } from '../../core/workspace.testing';
import { MovimientosFinancierosPage } from './movimientos.page';

function account(id: string, name: string, balance: number): AccountSummary {
  return {
    id,
    name,
    kind: 'wallet',
    active: true,
    openingBalance: 0,
    openingBalanceOn: '2026-09-01',
    defaultPaymentMethod: 'yape',
    note: null,
    updatedAt: '2026-09-01T15:00:00+00:00',
    totalIn: balance,
    totalOut: 0,
    balance,
    movements: 1,
    lastMovementAt: null,
    movementsBeforeOpening: 0,
    netBeforeOpening: 0,
  };
}

const ACCOUNTS = [account('acc-yape', 'Yape', 25), account('acc-cash', 'Efectivo', 100)];

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    key: 'tx-1-out',
    transactionId: 'tx-1',
    occurredAt: '2026-10-07T17:00:00.000Z',
    type: 'expense',
    accountId: 'acc-cash',
    accountName: 'Efectivo',
    otherAccountName: null,
    isCounterLeg: false,
    categoryName: null,
    paymentMethod: 'cash',
    signedAmount: -4,
    amount: 4,
    counterparty: null,
    reference: null,
    note: null,
    origin: null,
    orderNumber: null,
    walkInOrder: false,
    purchaseId: null,
    voided: false,
    voidReason: null,
    beforeOpening: false,
    otherBeforeOpening: false,
    ...overrides,
  };
}

const ALREADY_VOIDED = 'Este movimiento ya estaba anulado (motivo: «Se anotó dos veces»).';

/** Caja, for the owner unless said otherwise. The book is read once per call to `ledger`, in this order. */
async function open(
  books: LedgerRow[][],
  voidTransaction: () => Promise<void> = async () => undefined,
  role: MemberRole = 'owner',
  workspace: Provider = workspaceAs(role),
) {
  let reads = 0;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      workspace,
      {
        provide: FinanzasData,
        useValue: {
          accounts: async () => ACCOUNTS,
          categories: async () => [],
          ledger: async () => books[Math.min(reads++, books.length - 1)],
          voidTransaction,
        },
      },
    ],
  });
  // The forms scroll themselves into view, which jsdom does not draw.
  Element.prototype.scrollIntoView = () => undefined;

  const fixture = TestBed.createComponent(MovimientosFinancierosPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<MovimientosFinancierosPage>): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const text = (fixture: ComponentFixture<MovimientosFinancierosPage>) =>
  (fixture.nativeElement.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

function buttons(fixture: ComponentFixture<MovimientosFinancierosPage>): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('button'));
}

async function press(fixture: ComponentFixture<MovimientosFinancierosPage>, label: string): Promise<void> {
  const button = buttons(fixture).find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`no button «${label}» among ${buttons(fixture).map((b) => b.textContent?.trim()).join(', ')}`);
  button.click();
  await settle(fixture);
}

function field<T extends HTMLElement>(fixture: ComponentFixture<MovimientosFinancierosPage>, name: string): T {
  const element = fixture.nativeElement.querySelector(`[formcontrolname="${name}"]`) as T | null;
  if (!element) throw new Error(`no field «${name}»`);
  return element;
}

const labels = (fixture: ComponentFixture<MovimientosFinancierosPage>) =>
  buttons(fixture).map((button) => button.textContent?.trim());

describe('MovimientosFinancierosPage', () => {
  it('offers an operator to register but not to void', async () => {
    const fixture = await open([[row()]], undefined, 'operator');

    expect(labels(fixture)).toContain('Registrar movimiento');
    expect(labels(fixture)).not.toContain('Anular');
    expect(text(fixture)).toContain('Solo el dueño del taller puede anular un movimiento.');
  });

  it('offers a viewer neither, and says whose they are', async () => {
    const fixture = await open([[row()]], undefined, 'viewer');

    expect(labels(fixture)).not.toContain('Registrar movimiento');
    expect(labels(fixture)).not.toContain('Anular');
    expect(text(fixture)).toContain('Tu rol en el taller es de consulta');
  });

  it('offers a viewer no way to register on an empty book either', async () => {
    const fixture = await open([[]], undefined, 'viewer');

    expect(text(fixture)).toContain('Todavía no hay movimientos de dinero registrados.');
    expect(labels(fixture)).not.toContain('Registrar el primero');
    expect(fixture.nativeElement.querySelector('app-transaction-form')).toBeNull();
  });

  it('offers an operator the first movement on an empty book, not on an empty filter', async () => {
    const fixture = await open([[], []], undefined, 'operator');
    expect(labels(fixture)).toContain('Registrar el primero');

    const type = fixture.nativeElement.querySelectorAll('.filters select')[1] as HTMLSelectElement;
    type.value = 'transfer';
    type.dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(text(fixture)).toContain('No hay movimientos con estos filtros.');
    expect(labels(fixture)).not.toContain('Registrar el primero');
  });

  it('closes the movement form when the role read again cannot register', async () => {
    const workspace = fakeWorkspace('operator');
    const fixture = await open([[row()]], undefined, 'operator', { provide: CurrentWorkspace, useValue: workspace });
    await press(fixture, 'Registrar movimiento');
    expect(fixture.nativeElement.querySelector('app-transaction-form')).not.toBeNull();

    workspace.role.set('viewer');
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('app-transaction-form')).toBeNull();
  });

  it('reads the role again when the database says only the owner voids, and stops offering «Anular»', async () => {
    // The owner made this member an operator from another tab; `void_transaction` says so as a P0001.
    const workspace = fakeWorkspace('owner');
    const reread = {
      ...workspace,
      afterRefusal: async (error: unknown) => {
        if (!isPermissionError(error)) return false;
        workspace.role.set('operator');
        return true;
      },
    };
    const fixture = await open(
      [[row()]],
      async () => {
        throw new UserFacingError('Solo el dueño del taller puede anular un movimiento de dinero.');
      },
      'owner',
      { provide: CurrentWorkspace, useValue: reread },
    );

    await press(fixture, 'Anular');
    const reason = fixture.nativeElement.querySelector('app-void-form textarea') as HTMLTextAreaElement;
    reason.value = 'Era de prueba';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);
    await press(fixture, 'Anular movimiento');

    expect(text(fixture)).toContain('Solo el dueño del taller puede anular un movimiento de dinero.');
    expect(labels(fixture)).not.toContain('Anular');
  });

  it('turns the voiding form into «ya está anulado» when another tab voided it first (T5-10)', async () => {
    const voided = row({ key: 'tx-1-void', signedAmount: 0, voided: true, voidReason: 'Se anotó dos veces' });
    const fixture = await open([[row()], [voided]], async () => {
      throw new UserFacingError(ALREADY_VOIDED);
    });

    await press(fixture, 'Anular');
    const reason = fixture.nativeElement.querySelector('app-void-form textarea') as HTMLTextAreaElement;
    reason.value = 'Era de prueba';
    reason.dispatchEvent(new Event('input'));
    await settle(fixture);
    await press(fixture, 'Anular movimiento');

    expect(text(fixture)).toContain('Este movimiento ya está anulado (motivo: «Se anotó dos veces»)');
    expect(buttons(fixture).some((button) => button.textContent?.trim() === 'Anular movimiento')).toBe(false);
  });

  it('offers the corrections of a sale to «Clientes varios», and opens the egreso filled in (T5-05)', async () => {
    const collection = row({
      type: 'income',
      accountId: 'acc-yape',
      accountName: 'Yape',
      paymentMethod: 'yape',
      signedAmount: 25,
      amount: 25,
      orderNumber: 'ORD-2026-0001',
      walkInOrder: true,
    });
    const fixture = await open([[collection]]);

    await press(fixture, 'Anular');
    expect(text(fixture)).toContain('a nombre de nadie, así que no se anula');
    expect(text(fixture)).toContain('Registra un egreso de S/ 25.00 en Yape');
    expect(buttons(fixture).some((button) => button.textContent?.trim() === 'Anular movimiento')).toBe(false);

    await press(fixture, 'Registrar el egreso');

    expect(fixture.nativeElement.querySelector('app-void-form')).toBeNull();
    expect(field<HTMLSelectElement>(fixture, 'type').value).toBe('expense');
    expect(field<HTMLSelectElement>(fixture, 'accountId').value).toBe('acc-yape');
    expect(field<HTMLInputElement>(fixture, 'amount').value).toBe('25');
    expect(field<HTMLInputElement>(fixture, 'note').value).toBe('No llegó el cobro de ORD-2026-0001');
  });

  it('opens the transfer from the account the collection went into', async () => {
    const collection = row({
      type: 'income',
      accountId: 'acc-yape',
      accountName: 'Yape',
      signedAmount: 25,
      amount: 25,
      orderNumber: 'ORD-2026-0001',
      walkInOrder: true,
    });
    const fixture = await open([[collection]]);

    await press(fixture, 'Anular');
    await press(fixture, 'Registrar la transferencia');

    expect(field<HTMLSelectElement>(fixture, 'type').value).toBe('transfer');
    expect(field<HTMLSelectElement>(fixture, 'accountId').value).toBe('acc-yape');
    expect(field<HTMLSelectElement>(fixture, 'counterAccountId').value).toBe('');
    expect(text(fixture)).toContain('Elige la cuenta a la que llega el dinero.');
  });
});
