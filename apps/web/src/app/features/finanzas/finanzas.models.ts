import type { BadgeTone } from '../../ui';

/** Days are cut at midnight in Lima, wherever the browser happens to be. */
const TIME_ZONE = 'America/Lima';

export type AccountKind = 'cash' | 'bank' | 'wallet';
export type PaymentMethod = 'cash' | 'yape' | 'plin' | 'transfer';
export type TransactionDirection = 'income' | 'expense';
export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'owner_contribution'
  | 'owner_draw';

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Caja (efectivo)',
  bank: 'Banco',
  wallet: 'Billetera (Yape, Plin)',
};

export const ACCOUNT_KINDS = Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transfer: 'Transferencia bancaria',
};

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

/**
 * How money moves in an account of this kind, when there is only one answer:
 * a cash box takes cash. A bank or a wallet can take several (a transfer, Yape
 * or Plin), so it is left for the person to say.
 */
export function defaultMethodFor(kind: AccountKind): PaymentMethod | null {
  return kind === 'cash' ? 'cash' : null;
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Ingreso',
  expense: 'Egreso',
  transfer: 'Transferencia entre cuentas',
  owner_contribution: 'Aporte del dueño',
  owner_draw: 'Retiro del dueño',
};

export const TRANSACTION_TYPES = Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[];

/** Short enough to sit in a table cell next to the amount. */
export const TRANSACTION_TYPE_SHORT: Record<TransactionType, string> = {
  income: 'Ingreso',
  expense: 'Egreso',
  transfer: 'Transferencia',
  owner_contribution: 'Aporte',
  owner_draw: 'Retiro',
};

export const TRANSACTION_TYPE_TONES: Record<TransactionType, BadgeTone> = {
  income: 'good',
  expense: 'bad',
  transfer: 'info',
  owner_contribution: 'good',
  owner_draw: 'warn',
};

/**
 * Which way each type moves an account. A transfer is neither income nor
 * expense: the money only changes pocket, so it has no category either. The
 * database enforces the same pairing with a composite foreign key.
 */
export const TYPE_DIRECTION: Record<TransactionType, TransactionDirection | null> = {
  income: 'income',
  owner_contribution: 'income',
  expense: 'expense',
  owner_draw: 'expense',
  transfer: null,
};

export interface CategoryOption {
  id: string;
  name: string;
  direction: TransactionDirection;
}

/** The categories a type may be filed under. A transfer accepts none. */
export function categoriesFor(
  type: TransactionType,
  categories: readonly CategoryOption[],
): CategoryOption[] {
  const direction = TYPE_DIRECTION[type];
  if (direction === null) return [];
  return categories.filter((category) => category.direction === direction);
}

/**
 * The category a collection or a purchase payment is filed under when nobody
 * picks one: the one the owner chose, while it is still offered, else the only
 * one of its direction. It is the rule of `app.default_category` in the
 * database, which is what really applies it; this copy only lets a form say
 * so before saving, so the two change together.
 */
export function defaultCategory(
  direction: TransactionDirection,
  chosenId: string | null,
  categories: readonly CategoryOption[],
): CategoryOption | null {
  const ofDirection = categories.filter((category) => category.direction === direction);
  const chosen = ofDirection.find((category) => category.id === chosenId);
  if (chosen) return chosen;
  return ofDirection.length === 1 ? ofDirection[0]! : null;
}

/** Words that name a sale in a category: «Venta de productos», «Trabajos por encargo», «Cobros de pedidos». */
const SALE_WORDS = /\b(ventas?|encargos?|pedidos?|cobros?)\b/i;

/**
 * True when a category says «sale»: the one collections of orders are filed
 * under, or one whose name says it. A loose income in Caja under it is most
 * likely a sale or the collection of an order typed in the wrong place, and
 * since E5-01 it adds to the profit with no cost and nothing off the shelf.
 */
export function saysSale(category: CategoryOption | null | undefined, orderCategoryId: string | null): boolean {
  if (!category || category.direction !== 'income') return false;
  return category.id === orderCategoryId || SALE_WORDS.test(category.name);
}

/** True when the category can still be kept after the type changed. */
export function categoryFitsType(
  type: TransactionType,
  categoryId: string | null,
  categories: readonly CategoryOption[],
): boolean {
  if (categoryId === null) return true;
  return categoriesFor(type, categories).some((category) => category.id === categoryId);
}

/** A `numeric` column reaches the browser as a string or a number. */
export function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function numOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// --------------------------------------------------------------- receivables

export type AgingBucket = 'current' | 'recent' | 'late' | 'very_late';

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Al día',
  recent: 'Hasta 15 días',
  late: 'De 16 a 30 días',
  very_late: 'Más de 30 días',
};

export const AGING_TONES: Record<AgingBucket, BadgeTone> = {
  current: 'neutral',
  recent: 'info',
  late: 'warn',
  very_late: 'bad',
};

const RECENT_LIMIT_DAYS = 15;
const LATE_LIMIT_DAYS = 30;

/** How late a debt is, in the four steps the workshop chases them in. */
export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= RECENT_LIMIT_DAYS) return 'recent';
  if (daysOverdue <= LATE_LIMIT_DAYS) return 'late';
  return 'very_late';
}

// ----------------------------------------------------------------- calendar

/** Start and end of a Lima calendar day as instants (Peru has no DST: UTC-5). */
export function dayStart(isoDay: string): string {
  return `${isoDay}T00:00:00-05:00`;
}

export function dayEnd(isoDay: string): string {
  return `${isoDay}T23:59:59.999-05:00`;
}

export function timeLabel(timestamp: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * "Octubre 2026" for the first day of a month. The view returns a plain date
 * column, which `new Date()` would read as UTC and show as the month before
 * in Lima, so the parts are taken apart by hand.
 */
export function monthLabel(isoMonth: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoMonth);
  if (!match) return isoMonth;

  const text = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The calendar year of a month key, for the year filter of the results screen. */
export function yearOf(isoMonth: string): string {
  return isoMonth.slice(0, 4);
}
