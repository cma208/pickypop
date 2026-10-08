import { FormControl } from '@angular/forms';
import { todayLocal } from '../../core/dates';
import { requiredText } from '../../core/form-errors';
import {
  accountChanges,
  ACCOUNT_FIELD_MESSAGES,
  openingDayNotInFuture,
  openingShift,
  openingShiftNotice,
  withinLedgerLimit,
  type AccountInput,
  type AccountLeg,
} from './account-edit';

/** Intl puts a no-break space between «S/» and the number; the assertions read it as a plain one. */
const plain = (text: string) => text.replace(/ /g, ' ');

const YAPE: AccountInput = {
  name: 'Yape',
  kind: 'wallet',
  openingBalance: 200,
  openingBalanceOn: '2026-10-07',
  defaultPaymentMethod: 'yape',
  note: null,
};

describe('accountChanges (T5-09)', () => {
  it('sends nothing when nothing changed', () => {
    expect(accountChanges(YAPE, { ...YAPE })).toEqual({});
  });

  it('sends only what changed, never whether it is active', () => {
    const changes = accountChanges(YAPE, { ...YAPE, note: 'Prueba T5 nota' });
    expect(changes).toEqual({ note: 'Prueba T5 nota' });
    expect('active' in changes).toBe(false);
  });

  it('trims the name and rounds the opening balance before comparing', () => {
    expect(accountChanges(YAPE, { ...YAPE, name: '  Yape  ', openingBalance: 200.001 })).toEqual({});
    expect(accountChanges(YAPE, { ...YAPE, openingBalance: -50.557 })).toEqual({ opening_balance: -50.56 });
  });

  it('can clear the default method and the note', () => {
    expect(accountChanges({ ...YAPE, note: 'algo' }, { ...YAPE, defaultPaymentMethod: null, note: null })).toEqual({
      default_payment_method: null,
      note: null,
    });
  });
});

describe('account validators (T5-02, T5-11)', () => {
  it('treats a name of spaces as no name, and says it under the key `requiredText` gives', () => {
    const name = new FormControl(' ', requiredText);
    expect(name.errors).toEqual({ required: true });
    expect(ACCOUNT_FIELD_MESSAGES.name.required).toBe('Escribe el nombre de la cuenta.');
  });

  it('refuses an opening balance over the ceiling, either way', () => {
    expect(withinLedgerLimit(new FormControl(99_999_999_999))).toEqual({ tooLarge: true });
    expect(withinLedgerLimit(new FormControl(-1_000_000.01))).toEqual({ tooLarge: true });
    expect(withinLedgerLimit(new FormControl(-50.56))).toBeNull();
    expect(withinLedgerLimit(new FormControl(null))).toBeNull();
  });

  it('refuses an opening day after today in the workshop, like any date', () => {
    const validator = openingDayNotInFuture();
    expect(validator(new FormControl('2999-12-31'))).toEqual({ future: true });
    expect(validator(new FormControl(todayLocal()))).toBeNull();
    expect(validator(new FormControl('2026-10-01'))).toBeNull();
  });

  it('lets an account keep the future day it already had, and judges any other', () => {
    const validator = openingDayNotInFuture(() => '2999-12-31');
    expect(validator(new FormControl('2999-12-31'))).toBeNull();
    expect(validator(new FormControl('2999-12-30'))).toEqual({ future: true });
  });
});

describe('openingShift (T5-02)', () => {
  // Times in Lima: a movement at 20:00 on the 7th is still the 7th there.
  const legs: AccountLeg[] = [
    { occurredAt: '2026-10-06T15:00:00Z', signedAmount: 5, type: 'income' },
    { occurredAt: '2026-10-08T01:00:00Z', signedAmount: -1, type: 'expense' },
    { occurredAt: '2026-10-08T15:00:00Z', signedAmount: -170, type: 'expense' },
  ];

  it('says nothing when the day does not move, or nothing falls between', () => {
    expect(openingShift(legs, '2026-10-07', '2026-10-07')).toBeNull();
    expect(openingShift(legs, '2026-10-09', '2026-10-10')).toBeNull();
  });

  it('lists what stops counting when the day moves later', () => {
    const shift = openingShift(legs, '2026-10-07', '2026-10-08');
    expect(shift?.direction).toBe('out');
    expect(shift?.legs.map((leg) => leg.signedAmount)).toEqual([-1]);
    expect(shift?.net).toBe(-1);
  });

  it('lists what starts counting when the day moves earlier', () => {
    const shift = openingShift(legs, '2026-10-08', '2026-10-01');
    expect(shift?.direction).toBe('in');
    expect(shift?.legs.map((leg) => leg.signedAmount)).toEqual([5, -1]);
    expect(shift?.net).toBe(4);
  });

  it('says how the balance moves, with the opening balance changed too', () => {
    const shift = openingShift(legs, '2026-10-07', '2026-10-09')!;
    const text = plain(
      openingShiftNotice(shift, { name: 'Efectivo', balance: 299 }, { from: '2026-10-07', to: '2026-10-09' }, 0, '2026-10-08'),
    );
    expect(text).toBe(
      'Al mover la apertura de Efectivo del 7 de octubre al 9 de octubre, 2 movimientos (−S/ 171.00) dejan de contar en su saldo: quedaría dentro del saldo de apertura. El saldo pasaría de S/ 299.00 a S/ 470.00. Resultados no cambia.',
    );

    const earlier = openingShift(legs, '2026-10-08', '2026-10-01')!;
    expect(
      plain(openingShiftNotice(earlier, { name: 'Yape', balance: 200 }, { from: '2026-10-08', to: '2026-10-01' }, 10, '2026-10-08')),
    ).toContain('pasan a contar en su saldo. El saldo pasaría de S/ 200.00 a S/ 214.00.');
  });
});
