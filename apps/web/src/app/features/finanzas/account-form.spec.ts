import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { accountChanges, type AccountInput, type AccountLeg } from './account-edit';
import { AccountForm } from './account-form';
import { FinanzasData, StaleAccountError, type AccountSummary } from './finanzas.data';
import { NO_PAYMENT_DETAILS } from './payment-details';

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
  ...NO_PAYMENT_DETAILS,
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
  creates: AccountInput[];
  outdated: string[];
  saved: string[];
}

async function open(account: AccountSummary | null, update?: () => Promise<boolean>): Promise<Opened> {
  const updates: AccountInput[] = [];
  const creates: AccountInput[] = [];
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
          createAccount: async (input: AccountInput) => {
            creates.push(input);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountForm);
  fixture.componentRef.setInput('account', account);
  const opened: Opened = { fixture, updates, creates, outdated: [], saved: [] };
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

async function choose(fixture: ComponentFixture<AccountForm>, name: string, value: string): Promise<void> {
  const select = field(fixture, name) as unknown as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await settle(fixture);
}

const shownFields = (fixture: ComponentFixture<AccountForm>) =>
  (['holderName', 'accountNumber', 'interbankNumber', 'phone'] as const).filter(
    (name) => fixture.nativeElement.querySelector(`[formcontrolname="${name}"]`) !== null,
  );

const BCP: AccountSummary = {
  ...CASH,
  id: 'acc-2',
  name: 'BCP',
  kind: 'bank',
  defaultPaymentMethod: 'transfer',
  movements: 0,
  holderName: 'Carlos Machicado',
  accountNumber: '191-12345678-0-12',
  interbankNumber: '00219111234567801255',
  phone: '987654321',
};

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

  describe('the details for getting paid', () => {
    it('reads the CCI and phone shown in blocks back as digits, so saving untouched changes no column', async () => {
      const { fixture, updates } = await open(BCP);

      await save(fixture);

      expect(updates).toHaveLength(1);
      expect(accountChanges(BCP, updates[0]!)).toEqual({});
    });

    it('offers none for a cash box, all four for a bank and all but the account number for a wallet', async () => {
      const { fixture } = await open(null);
      expect(shownFields(fixture)).toEqual([]);

      await choose(fixture, 'kind', 'bank');
      expect(shownFields(fixture)).toEqual(['holderName', 'accountNumber', 'interbankNumber', 'phone']);
      expect(text(fixture)).toContain('Para recibir pagos');

      await choose(fixture, 'kind', 'wallet');
      expect(shownFields(fixture)).toEqual(['holderName', 'interbankNumber', 'phone']);
    });

    it('saves a new bank with its CCI as 20 digits and the phone without the +51', async () => {
      const { fixture, creates } = await open(null);

      await type(fixture, 'name', 'BCP');
      await choose(fixture, 'kind', 'bank');
      await type(fixture, 'holderName', '  Carlos Machicado ');
      await type(fixture, 'accountNumber', '191 12345678 0 12');
      await type(fixture, 'interbankNumber', '002-191-112345678012-55');
      await type(fixture, 'phone', '+51 987 654 321');
      await save(fixture);

      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({
        holderName: 'Carlos Machicado',
        accountNumber: '191-12345678-0-12',
        interbankNumber: '00219111234567801255',
        phone: '987654321',
      });
    });

    it('saves them empty when nobody writes them', async () => {
      const { fixture, creates } = await open(null);

      await type(fixture, 'name', 'Interbank');
      await choose(fixture, 'kind', 'bank');
      await save(fixture);

      expect(creates[0]).toMatchObject({ holderName: null, accountNumber: null, interbankNumber: null, phone: null });
    });

    it('says a CCI that is not 20 digits next to the field, and sends nothing', async () => {
      const { fixture, creates } = await open(null);

      await type(fixture, 'name', 'BCP');
      await choose(fixture, 'kind', 'bank');
      await type(fixture, 'interbankNumber', '0021911123');
      await save(fixture);

      expect(creates).toEqual([]);
      expect(text(fixture)).toContain('El CCI tiene 20 dígitos');
    });

    it('refuses a phone that is not a Peruvian mobile', async () => {
      const { fixture, creates } = await open(null);

      await type(fixture, 'name', 'Yape');
      await choose(fixture, 'kind', 'wallet');
      await type(fixture, 'phone', '014567890');
      await save(fixture);

      expect(creates).toEqual([]);
      expect(text(fixture)).toContain('9 dígitos que empiezan con 9');
    });

    it('does not let a field the kind hides block saving, and drops what it held', async () => {
      const { fixture, creates } = await open(null);

      await type(fixture, 'name', 'Caja chica');
      await choose(fixture, 'kind', 'bank');
      await type(fixture, 'interbankNumber', '123');
      await choose(fixture, 'kind', 'cash');
      await save(fixture);

      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({ kind: 'cash', interbankNumber: null });
    });

    it('opens an account with what it has, and turning a bank into a wallet drops its account number', async () => {
      const { fixture, updates } = await open(BCP);

      expect(field(fixture, 'interbankNumber').value).toBe('002-191-112345678012-55');
      expect(field(fixture, 'phone').value).toBe('987 654 321');

      await choose(fixture, 'kind', 'wallet');
      await save(fixture);

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        kind: 'wallet',
        holderName: 'Carlos Machicado',
        accountNumber: null,
        interbankNumber: '00219111234567801255',
        phone: '987654321',
      });
    });
  });
});
