import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AccountInput, AccountLeg } from './account-edit';
import { AccountForm } from './account-form';
import { FinanzasData, StaleAccountError, type AccountSummary } from './finanzas.data';

const STALE =
  'La cuenta cambió en otra pestaña, o la cambió otra persona, mientras la editabas: no se guardó nada. Vuelve a abrirla para ver cómo quedó.';

const CASH: AccountSummary = {
  id: 'acc-1',
  name: 'Efectivo',
  kind: 'cash',
  active: true,
  openingBalance: 100,
  openingBalanceOn: '2026-09-01',
  defaultPaymentMethod: 'cash',
  note: null,
  updatedAt: '2026-09-01T15:00:00+00:00',
  totalIn: 50,
  totalOut: 20,
  balance: 130,
  movements: 2,
  lastMovementAt: '2026-09-20T15:00:00+00:00',
  movementsBeforeOpening: 0,
  netBeforeOpening: 0,
};

/** Midday in Lima, so the local day is the one written. */
const LEGS: AccountLeg[] = [
  { occurredAt: '2026-09-05T17:00:00.000Z', signedAmount: 50, type: 'income' },
  { occurredAt: '2026-09-20T17:00:00.000Z', signedAmount: -20, type: 'expense' },
];

interface Opened {
  fixture: ComponentFixture<AccountForm>;
  updates: AccountInput[];
  outdated: string[];
  saved: string[];
}

async function open(account: AccountSummary | null, update?: () => Promise<boolean>): Promise<Opened> {
  const updates: AccountInput[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FinanzasData,
        useValue: {
          accountLegs: async () => LEGS,
          updateAccount: async (_account: AccountSummary, input: AccountInput) => {
            updates.push(input);
            return update ? update() : true;
          },
          createAccount: async () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountForm);
  fixture.componentRef.setInput('account', account);
  const opened: Opened = { fixture, updates, outdated: [], saved: [] };
  fixture.componentInstance.outdated.subscribe((message) => opened.outdated.push(message));
  fixture.componentInstance.saved.subscribe((message) => opened.saved.push(message));
  await settle(fixture);
  return opened;
}

async function settle(fixture: ComponentFixture<AccountForm>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const text = (fixture: ComponentFixture<AccountForm>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

function field(fixture: ComponentFixture<AccountForm>, name: string): HTMLInputElement {
  const element = fixture.nativeElement.querySelector(`[formcontrolname="${name}"]`) as HTMLInputElement | null;
  if (!element) throw new Error(`no field «${name}»`);
  return element;
}

async function type(fixture: ComponentFixture<AccountForm>, name: string, value: string): Promise<void> {
  const input = field(fixture, name);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

function saveButton(fixture: ComponentFixture<AccountForm>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
}

async function save(fixture: ComponentFixture<AccountForm>): Promise<void> {
  (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  await settle(fixture);
}

describe('AccountForm', () => {
  it('says which movements stop counting before moving the opening day, and waits for the yes (T5-02)', async () => {
    const { fixture, updates } = await open(CASH);

    await type(fixture, 'openingBalanceOn', '2026-09-10');
    await save(fixture);

    expect(updates).toEqual([]);
    expect(text(fixture)).toContain('1 movimiento');
    expect(text(fixture)).toContain('deja de contar en su saldo');
    expect(saveButton(fixture).disabled).toBe(true);

    const confirm = fixture.nativeElement.querySelector('label.check input') as HTMLInputElement;
    confirm.click();
    await settle(fixture);
    expect(saveButton(fixture).disabled).toBe(false);

    await save(fixture);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.openingBalanceOn).toBe('2026-09-10');
  });

  it('asks again once the date changes after the yes', async () => {
    const { fixture, updates } = await open(CASH);

    await type(fixture, 'openingBalanceOn', '2026-09-10');
    await save(fixture);
    (fixture.nativeElement.querySelector('label.check input') as HTMLInputElement).click();
    await settle(fixture);

    await type(fixture, 'openingBalanceOn', '2026-09-25');
    await save(fixture);

    expect(updates).toEqual([]);
    expect(text(fixture)).toContain('2 movimientos');
  });

  it('saves without asking when no movement changes side', async () => {
    const { fixture, updates } = await open(CASH);

    await type(fixture, 'openingBalanceOn', '2026-09-02');
    await save(fixture);

    expect(updates).toHaveLength(1);
  });

  it('hands an account changed in another tab back to the page, saving nothing (T5-09)', async () => {
    const { fixture, outdated, saved } = await open(CASH, async () => {
      throw new StaleAccountError(STALE);
    });

    await type(fixture, 'note', 'Caja del mostrador');
    await save(fixture);

    expect(outdated).toEqual([STALE]);
    expect(saved).toEqual([]);
  });

  it('takes a name of spaces only for no name, and says it next to the field (T5-11)', async () => {
    const { fixture, updates } = await open(CASH);

    await type(fixture, 'name', '   ');
    await save(fixture);

    expect(updates).toEqual([]);
    expect(text(fixture)).toContain('Escribe el nombre de la cuenta.');
  });

  it('saves the note of an account that already opened in the future, without moving its day', async () => {
    const { fixture, updates } = await open({ ...CASH, openingBalanceOn: '2999-12-31', movements: 0 });

    await type(fixture, 'note', 'Caja del mostrador');
    await save(fixture);

    expect(text(fixture)).not.toContain('No puede ser posterior a hoy');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.note).toBe('Caja del mostrador');
  });

  it('still refuses moving that day to another one in the future', async () => {
    const { fixture, updates } = await open({ ...CASH, openingBalanceOn: '2999-12-31', movements: 0 });

    await type(fixture, 'openingBalanceOn', '2999-12-30');
    await save(fixture);

    expect(updates).toEqual([]);
    expect(text(fixture)).toContain('No puede ser posterior a hoy');
  });

  it('refuses an opening day after today before sending it (T1-10)', async () => {
    const { fixture, updates } = await open(null);

    await type(fixture, 'name', 'BCP');
    await type(fixture, 'openingBalanceOn', '2999-12-31');
    await save(fixture);

    expect(updates).toEqual([]);
    expect(text(fixture)).toContain('No puede ser posterior a hoy');
  });
});
