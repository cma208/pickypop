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
  /** A category of sales: collections of orders and the quick sale use it, a loose income cannot. */
  sales: boolean;
  /** A category of capital: only the owner's contributions and draws use it, and they use only these. */
  capital: boolean;
}

/**
 * The largest single movement the workshop records, in soles. A typo with
 * three zeros too many is far more likely than a movement of a million. The
 * database refuses the same (`app.ledger_amount_limit()`): if one changes,
 * the other changes with it.
 */
export const MAX_LEDGER_AMOUNT = 1_000_000;

/** The two types that are capital, not profit: the owner's money going in or out. */
export function isOwnerType(type: TransactionType): boolean {
  return type === 'owner_contribution' || type === 'owner_draw';
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
 * one that fits: of sales for a collection, not of capital for a payment. It
 * is the rule of `app.default_category` in the database, which is what really
 * applies it; this copy only lets a form say so before saving, so the two
 * change together.
 */
export function defaultCategory(
  direction: TransactionDirection,
  chosenId: string | null,
  categories: readonly CategoryOption[],
): CategoryOption | null {
  // With «Venta de productos» off, «Aporte del dueño» was the only income left
  // and took every collection (T5-07).
  const candidates = categories.filter(
    (category) =>
      category.direction === direction && !category.capital && (direction === 'expense' || category.sales),
  );
  const chosen = candidates.find((category) => category.id === chosenId);
  if (chosen) return chosen;
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * The categories a movement typed in Caja may be filed under. A loose income
 * («Ingreso»: no order behind it) is not offered the categories of sales: a
 * sale goes through Pedidos or the quick sale, which take it off the shelf
 * with its cost, and the collection of an order through the order, or it
 * would count twice. Collections and the quick sale keep using them. The
 * database refuses it as well (`app.loose_income_is_not_a_sale`): this only
 * keeps them out of the list.
 *
 * A category of capital goes with the owner's contributions and draws, and
 * only with them: an income filed under «Aporte del dueño» added to the
 * profit (T5-06). The database refuses that too (`app.guard_ledger_entry`).
 */
export function cashCategoriesFor(
  type: TransactionType,
  categories: readonly CategoryOption[],
): CategoryOption[] {
  const offered = categoriesFor(type, categories);
  if (isOwnerType(type)) return offered.filter((category) => category.capital);
  return offered.filter((category) => !category.capital && !(type === 'income' && category.sales));
}

/**
 * What the collection of an order may be filed under: an income that is not
 * capital. Capital is the owner's money, and a collection is a sale.
 */
export function collectionCategoriesFor(categories: readonly CategoryOption[]): CategoryOption[] {
  return categoriesFor('income', categories).filter((category) => !category.capital);
}

/** Why the categories of sales are not in Caja's list. */
const SALES_HIDDEN_HINT = 'Las categorías de ventas no se ofrecen aquí: son de los cobros de pedidos y de la Venta rápida.';
/** Why the ones of capital are not there either, said after the sales one or alone. */
const CAPITAL_HIDDEN_HINT = {
  afterSales: 'Las de capital tampoco: la plata que metes al taller va como «Aporte del dueño», con su propio tipo.',
  income: 'Las categorías de capital no se ofrecen aquí: la plata que metes al taller va como «Aporte del dueño», con su propio tipo.',
  expense: 'Las categorías de capital no se ofrecen aquí: la plata que sacas para ti va como «Retiro del dueño», con su propio tipo.',
} as const;
/** Where a category that does fit is made, when none is left to choose. Only the owner can (ADR-025). */
const CREATE_CATEGORY_HINT = {
  owner: 'Crea una que no sea de ventas (por ejemplo «Reembolsos») en Configuración › Categorías de dinero.',
  other: 'Pídele al dueño del taller que cree una que no sea de ventas (por ejemplo «Reembolsos»): las categorías son de la configuración.',
} as const;
/** An owner's movement already says what it is. */
const OWNER_HINT = 'Solo las de capital: un aporte o un retiro del dueño no es un ingreso ni un gasto del taller.';
const OWNER_NONE_HINT = 'No hace falta: el tipo ya dice que es capital. Solo se ofrecen las categorías de capital, y no hay ninguna.';

/**
 * What Caja's category field says. With the categories of sales or of capital
 * hidden it says why; and when that leaves a loose income nothing to choose (a
 * workshop that only has the two of sales bootstrap.sql creates) also where to
 * make one, or every loose income would go without a category for want of
 * knowing.
 */
export function cashCategoryHint(
  type: TransactionType,
  categories: readonly CategoryOption[],
  isOwner = true,
): string | undefined {
  const direction = TYPE_DIRECTION[type];
  if (direction === null) return undefined;

  const all = categoriesFor(type, categories);
  const offered = cashCategoriesFor(type, categories).length;
  if (isOwnerType(type)) {
    if (offered > 0) return OWNER_HINT;
    return all.length > 0 ? OWNER_NONE_HINT : undefined;
  }

  const salesHidden = type === 'income' && all.some((category) => category.sales);
  const capitalHidden = all.some((category) => category.capital);
  const parts: string[] = [];
  if (salesHidden) parts.push(SALES_HIDDEN_HINT);
  if (capitalHidden) parts.push(salesHidden ? CAPITAL_HIDDEN_HINT.afterSales : CAPITAL_HIDDEN_HINT[direction]);
  if (parts.length > 0 && offered === 0 && type === 'income') parts.push(CREATE_CATEGORY_HINT[isOwner ? 'owner' : 'other']);

  if (parts.length > 0) return parts.join(' ');
  return offered === 0 ? 'No hay categorías de este tipo todavía.' : undefined;
}

/** True when the category can still be kept in Caja after the type changed. */
export function categoryFitsType(
  type: TransactionType,
  categoryId: string | null,
  categories: readonly CategoryOption[],
): boolean {
  if (categoryId === null) return true;
  return cashCategoriesFor(type, categories).some((category) => category.id === categoryId);
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
