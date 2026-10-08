import { localDate, todayLocal } from '../../core/dates';
import { money } from '../../core/format';
import { roundMoney } from '../../core/pricing';

/** What a movement needs to know about the account it touches. */
export interface OpeningOf {
  name: string;
  /** "2026-10-07": the day of the opening balance. */
  openingBalanceOn: string;
}

/**
 * True when a movement happened, in Lima, before the day of the account's
 * opening balance. That money is already inside the opening balance, so it
 * does not move it again (E5-02). It is the rule of
 * `transaction_entries.before_opening` in the database, which is what really
 * applies it: this copy only lets a form say so before saving, so the two
 * change together. A movement on the opening day itself counts.
 */
export function beforeOpening(occurredAt: string, openingBalanceOn: string): boolean {
  return dayBeforeOpening(localDate(occurredAt), openingBalanceOn);
}

/** The same rule for a plain day ("2026-09-30"), like the date of a purchase. */
export function dayBeforeOpening(isoDay: string, openingBalanceOn: string): boolean {
  return isoDay < openingBalanceOn;
}

const DAY_MONTH = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * «7 de octubre», with the year only when it is not this one. Built from the
 * parts: `new Date('2026-10-07')` is UTC midnight, the 6th in Lima.
 */
export function openingDay(isoDate: string, today = todayLocal()): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const date = new Date(year, month - 1, day);
  return (isoDate.slice(0, 4) === today.slice(0, 4) ? DAY_MONTH : DAY_MONTH_YEAR).format(date);
}

/**
 * The warning a form shows before saving a movement dated before the opening
 * of its account. `stillCounts` says what the movement still does elsewhere
 * («cuenta en Resultados», «el cobro cuenta para el pedido»); a transfer has
 * nothing to add.
 */
export function beforeOpeningNotice(account: OpeningOf, stillCounts: string | null, today = todayLocal()): string {
  const head = `Es anterior a la apertura de ${account.name} (${openingDay(account.openingBalanceOn, today)})`;
  const tail = 'no cambia su saldo, porque ya está dentro del saldo de apertura.';
  return stillCounts ? `${head}: ${stillCounts}, pero ${tail}` : `${head}: ${tail}`;
}

/** What the accounts screen reads about the movements an account already had before it opened. */
export interface BeforeOpeningTally extends OpeningOf {
  movementsBeforeOpening: number;
  /** Their signed sum: what they would have moved. */
  netBeforeOpening: number;
}

/**
 * «2 movimientos anteriores al 7 de octubre (+S/ 5.00) no cambian el saldo»:
 * why the balance is not the opening plus everything the book lists. Null when
 * there are none.
 */
export function beforeOpeningSummary(account: BeforeOpeningTally, today = todayLocal()): string | null {
  const count = account.movementsBeforeOpening;
  if (count <= 0) return null;

  const net = roundMoney(account.netBeforeOpening);
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  const movements = count === 1 ? '1 movimiento anterior' : `${count} movimientos anteriores`;
  const verb = count === 1 ? 'no cambia' : 'no cambian';
  return `${movements} al ${openingDay(account.openingBalanceOn, today)} (${sign}${money(Math.abs(net))}) ${verb} el saldo`;
}
