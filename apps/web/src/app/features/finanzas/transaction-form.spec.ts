import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { workspaceAs } from '../../core/workspace.testing';
import { FinanzasData, type AccountSummary } from './finanzas.data';
import type { TransactionType } from './finanzas.models';
import { NO_PAYMENT_DETAILS } from './payment-details';
import { TransactionForm } from './transaction-form';

const CASH: AccountSummary = {
  id: 'acc-cash',
  name: 'Efectivo',
  kind: 'cash',
  active: true,
  openingBalance: 0,
  openingBalanceOn: '2026-09-01',
  defaultPaymentMethod: 'cash',
  note: null,
  ...NO_PAYMENT_DETAILS,
  updatedAt: '2026-09-01T15:00:00+00:00',
  totalIn: 100,
  totalOut: 0,
  balance: 100,
  movements: 1,
  lastMovementAt: null,
  movementsBeforeOpening: 0,
  netBeforeOpening: 0,
};

const PURCHASE_NOTE =
  '¿Es una compra de filamento, insumos o empaque? Regístrala en Compras: así queda su costo y no se cuenta dos veces.';

function open() {
  const createTransaction = vi.fn(async () => 'tx-1');
  TestBed.configureTestingModule({
    providers: [provideRouter([]), workspaceAs('operator'), { provide: FinanzasData, useValue: { createTransaction } }],
  });
  const fixture = TestBed.createComponent(TransactionForm);
  fixture.componentRef.setInput('allAccounts', [CASH]);
  fixture.componentRef.setInput('allCategories', []);
  fixture.detectChanges();
  return { fixture, createTransaction };
}

const el = (fixture: ComponentFixture<TransactionForm>) => fixture.nativeElement as HTMLElement;
const note = (fixture: ComponentFixture<TransactionForm>) =>
  (el(fixture).querySelector('app-cash-elsewhere')?.textContent ?? '').replace(/\s+/g, ' ').trim();

function choose(fixture: ComponentFixture<TransactionForm>, name: string, value: string): void {
  const select = el(fixture).querySelector<HTMLSelectElement>(`[formcontrolname="${name}"]`)!;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

function typeIn(fixture: ComponentFixture<TransactionForm>, name: string, value: string): void {
  const input = el(fixture).querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('TransactionForm, an expense that is really a purchase', () => {
  it('sends a purchase of filament, supplies or packaging to Compras', () => {
    const { fixture } = open();
    choose(fixture, 'type', 'expense');

    expect(note(fixture)).toBe(PURCHASE_NOTE);
    const link = el(fixture).querySelector('app-cash-elsewhere a')!;
    expect(link.textContent).toBe('Compras');
    expect(link.getAttribute('href')).toBe('/inventario/compras');
  });

  it('no longer offers spare parts as an expense of Caja', () => {
    const { fixture } = open();
    choose(fixture, 'type', 'expense');
    expect(el(fixture).textContent).not.toContain('repuestos');
  });

  it('only says it, and the expense is still recorded', async () => {
    const { fixture, createTransaction } = open();
    choose(fixture, 'type', 'expense');
    choose(fixture, 'accountId', 'acc-cash');
    typeIn(fixture, 'amount', '12.5');

    const submit = el(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(false);
    submit.click();
    await fixture.whenStable();

    expect(createTransaction).toHaveBeenCalledTimes(1);
  });

  it.each<[TransactionType, string]>([
    ['income', '¿Es una venta?'],
    ['transfer', ''],
    ['owner_contribution', ''],
    ['owner_draw', ''],
  ])('says something else, or nothing, for %s', (type, start) => {
    const { fixture } = open();
    choose(fixture, 'type', type);
    expect(note(fixture)).not.toContain('Compras');
    expect(note(fixture).startsWith(start)).toBe(true);
    if (start === '') expect(note(fixture)).toBe('');
  });
});
