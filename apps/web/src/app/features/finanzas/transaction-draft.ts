import { inputToIso } from '../../core/dates';
import { roundMoney } from '../../core/pricing';
import { TYPE_DIRECTION, type PaymentMethod, type TransactionType } from './finanzas.models';

/** Raw values of the movement form, straight from the controls. */
export interface TransactionFormValue {
  type: TransactionType;
  accountId: string;
  /** Where a transfer lands. Ignored by every other type. */
  counterAccountId: string;
  categoryId: string;
  amount: number | null;
  occurredAt: string;
  paymentMethod: PaymentMethod;
  counterparty: string;
  reference: string;
  note: string;
}

/** What the database is asked to store, already cleaned up. */
export interface TransactionDraft {
  accountId: string;
  counterAccountId: string | null;
  type: TransactionType;
  categoryId: string | null;
  amount: number;
  occurredAt: string;
  paymentMethod: PaymentMethod;
  counterparty: string | null;
  reference: string | null;
  note: string | null;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The first thing wrong with the form, written for the person, or null when
 * it can be saved. These are the same rules the table checks, said in Spanish
 * before the round trip instead of as a constraint violation after it.
 */
export function draftProblem(value: TransactionFormValue): string | null {
  if (!value.accountId) return 'Elige la cuenta del movimiento.';

  if (value.amount === null || !Number.isFinite(value.amount)) return 'Indica el monto.';
  if (roundMoney(value.amount) <= 0) return 'El monto tiene que ser mayor que cero.';

  if (value.type === 'transfer') {
    if (!value.counterAccountId) return 'Elige la cuenta a la que llega el dinero.';
    if (value.counterAccountId === value.accountId) {
      return 'La cuenta de destino tiene que ser distinta de la de origen.';
    }
  }

  if (!value.occurredAt) return 'Indica la fecha y la hora del movimiento.';
  // Checked before `inputToIso`, which throws on a half-typed value.
  if (Number.isNaN(Date.parse(value.occurredAt))) return 'La fecha y la hora no son válidas.';

  return null;
}

/**
 * Turns the form into the single row the ledger stores. A transfer is one
 * row with two accounts, never two rows, so the two halves cannot drift
 * apart; and it carries no category, because moving money is neither earning
 * nor spending it.
 */
export function buildTransactionDraft(value: TransactionFormValue): TransactionDraft {
  const isTransfer = value.type === 'transfer';

  return {
    accountId: value.accountId,
    counterAccountId: isTransfer ? value.counterAccountId : null,
    type: value.type,
    categoryId: TYPE_DIRECTION[value.type] === null ? null : textOrNull(value.categoryId),
    amount: roundMoney(value.amount ?? 0),
    occurredAt: inputToIso(value.occurredAt),
    paymentMethod: value.paymentMethod,
    counterparty: isTransfer ? null : textOrNull(value.counterparty),
    reference: textOrNull(value.reference),
    note: textOrNull(value.note),
  };
}

/**
 * What the movement does to each account, for the confirmation line. A
 * transfer leaves one and reaches the other, which is why the workshop total
 * does not change.
 */
export interface TransactionEffect {
  accountId: string;
  delta: number;
}

export function effectsOf(draft: TransactionDraft): TransactionEffect[] {
  if (draft.type === 'transfer' && draft.counterAccountId) {
    return [
      { accountId: draft.accountId, delta: -draft.amount },
      { accountId: draft.counterAccountId, delta: draft.amount },
    ];
  }

  const direction = TYPE_DIRECTION[draft.type];
  return [{ accountId: draft.accountId, delta: direction === 'income' ? draft.amount : -draft.amount }];
}
