import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { localDate, todayLocal } from '../../core/dates';
import { notInFuture } from '../../core/form-errors';
import { money } from '../../core/format';
import { roundMoney, sumMoney } from '../../core/pricing';
import type { AccountKind, PaymentMethod, TransactionType } from './finanzas.models';
import { MAX_LEDGER_AMOUNT } from './finanzas.models';
import { openingDay } from './opening-balance';

/** What the account form can change. Whether it is active has its own button in Cuentas. */
export interface AccountInput {
  name: string;
  kind: AccountKind;
  openingBalance: number;
  openingBalanceOn: string;
  defaultPaymentMethod: PaymentMethod | null;
  note: string | null;
}

/** The columns an update sends, only for what changed. */
export interface AccountChanges {
  name?: string;
  kind?: AccountKind;
  opening_balance?: number;
  opening_balance_on?: string;
  default_payment_method?: PaymentMethod | null;
  note?: string | null;
}

/**
 * Only what the person changed. The form used to send every field, the old
 * `active` included: from an old tab it reactivated an account somebody had
 * just deactivated, without a word (T5-09).
 */
export function accountChanges(before: AccountInput, after: AccountInput): AccountChanges {
  const changes: AccountChanges = {};
  const name = after.name.trim();
  if (name !== before.name) changes.name = name;
  if (after.kind !== before.kind) changes.kind = after.kind;
  const opening = roundMoney(after.openingBalance);
  if (opening !== roundMoney(before.openingBalance)) changes.opening_balance = opening;
  if (after.openingBalanceOn !== before.openingBalanceOn) changes.opening_balance_on = after.openingBalanceOn;
  if (after.defaultPaymentMethod !== before.defaultPaymentMethod) {
    changes.default_payment_method = after.defaultPaymentMethod;
  }
  if ((after.note ?? null) !== (before.note ?? null)) changes.note = after.note ?? null;
  return changes;
}

// ------------------------------------------------------------- validators

/** The opening balance has the ceiling of any movement, both ways. */
export function withinLedgerLimit(control: AbstractControl): ValidationErrors | null {
  const value = control.value as number | null;
  if (value === null || !Number.isFinite(Number(value))) return null;
  return Math.abs(roundMoney(Number(value))) > MAX_LEDGER_AMOUNT ? { tooLarge: true } : null;
}

/**
 * The opening balance is what was already there the day it is registered, so
 * its day cannot be after today in the workshop (T5-02, T1-10): `notInFuture`,
 * like any date. Only a day the person moves is judged, as the database does:
 * an account that already opens in the future (from before the rule) still
 * takes a new note without having its date moved first. `kept` is the day the
 * account has.
 */
export function openingDayNotInFuture(kept: () => string | null = () => null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    control.value && control.value === kept() ? null : notInFuture(control);
}

export const ACCOUNT_FIELD_MESSAGES = {
  name: { required: 'Escribe el nombre de la cuenta.' },
  openingBalance: {
    required: 'Indica el saldo de apertura, aunque sea cero.',
    tooLarge: `El saldo de apertura pasa del máximo, ${money(MAX_LEDGER_AMOUNT)}: revisa que esté bien escrito.`,
  },
  openingBalanceOn: {
    required: 'Indica la fecha del saldo de apertura.',
    future: 'No puede ser posterior a hoy: es lo que había en la cuenta el día que la registras.',
  },
} as const;

// ------------------------------------------------- moving the opening day

/** One leg of a movement, as the account sees it. */
export interface AccountLeg {
  occurredAt: string;
  signedAmount: number;
  type: TransactionType;
}

export interface OpeningShift {
  /** «out»: they counted and stop counting. «in»: they did not count and start to. */
  direction: 'out' | 'in';
  legs: AccountLeg[];
  /** Their signed sum: what the balance moves by, the other way for «out». */
  net: number;
}

/**
 * Which movements change side when the opening day moves. A movement dated
 * before the opening is already inside the opening balance and does not move
 * it (E5-02). Moving the day later leaves out what falls between the two
 * days; moving it earlier brings it in. Null when nothing changes side.
 */
export function openingShift(legs: readonly AccountLeg[], from: string, to: string): OpeningShift | null {
  if (from === to) return null;
  const [low, high] = from < to ? [from, to] : [to, from];
  const between = legs.filter((leg) => {
    const day = localDate(leg.occurredAt);
    return day >= low && day < high;
  });
  if (between.length === 0) return null;

  return {
    direction: from < to ? 'out' : 'in',
    legs: [...between].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    net: sumMoney(between.map((leg) => leg.signedAmount)),
  };
}

/**
 * The sentence before saving, so moving the day does not take money out of a
 * balance without a word (T5-02). `openingDelta` is what the opening balance
 * itself changes by in the same edit, so the balance said is the one that
 * will be.
 */
export function openingShiftNotice(
  shift: OpeningShift,
  account: { name: string; balance: number },
  dates: { from: string; to: string },
  openingDelta = 0,
  today = todayLocal(),
): string {
  const count = shift.legs.length === 1 ? '1 movimiento' : `${shift.legs.length} movimientos`;
  const sign = shift.net > 0 ? '+' : shift.net < 0 ? '−' : '';
  const net = `${sign}${money(Math.abs(shift.net))}`;
  const balance = sumMoney([account.balance, openingDelta, shift.direction === 'out' ? -shift.net : shift.net]);
  const moved = `Al mover la apertura de ${account.name} del ${openingDay(dates.from, today)} al ${openingDay(dates.to, today)}`;

  return shift.direction === 'out'
    ? `${moved}, ${count} (${net}) ${shift.legs.length === 1 ? 'deja' : 'dejan'} de contar en su saldo: quedaría dentro del saldo de apertura. El saldo pasaría de ${money(account.balance)} a ${money(balance)}. Resultados no cambia.`
    : `${moved}, ${count} (${net}) ${shift.legs.length === 1 ? 'pasa' : 'pasan'} a contar en su saldo. El saldo pasaría de ${money(account.balance)} a ${money(balance)}. Resultados no cambia.`;
}
