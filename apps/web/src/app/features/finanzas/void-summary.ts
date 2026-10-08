import { money } from '../../core/format';
import { TRANSACTION_TYPE_LABELS, type TransactionType } from './finanzas.models';

/** The part of a ledger row the voiding form describes. */
export interface VoidedRow {
  type: TransactionType;
  amount: number;
  accountName: string;
  otherAccountName: string | null;
  isCounterLeg: boolean;
  /** The order it collected or refunded. */
  orderNumber: string | null;
  /** That order is a sale to «Clientes varios», which never owes. */
  walkInOrder: boolean;
  /** The purchase it paid. */
  purchaseId: string | null;
}

export interface VoidSummary {
  /** «Egreso de S/ 4.00 en Efectivo», «Transferencia de S/ 30.00 de Yape a Efectivo». */
  what: string;
  /** For a transfer: that both of its legs go, not only the one clicked. */
  legs: string | null;
  /** What else moves when it goes: the order owes again, the purchase is to be paid again. */
  consequence: string | null;
  /** Why it cannot be voided at all, said before anyone writes a reason. */
  blocked: string | null;
}

/**
 * What is about to be annulled, in words. A transfer is one row with two
 * legs, and the form used to name only the leg it was opened from: «Viene de
 * Yape» read as a movement of Efectivo alone (E5-06). It names both accounts
 * in the direction the money went, whichever leg was clicked.
 *
 * It also says what the voiding does elsewhere. Annulling a collection sent
 * the order back to «Por cobrar» and a purchase payment sent the purchase back
 * to «Por pagar» without a word, and the collection of a sale to «Clientes
 * varios» left a debt in the name of nobody (T5-05). That one the database
 * refuses, and the form says so first.
 */
export function voidSummary(row: VoidedRow): VoidSummary {
  const amount = money(row.amount);
  const summary: VoidSummary = { what: '', legs: null, consequence: null, blocked: null };

  if (row.type === 'transfer' && row.otherAccountName) {
    const [from, to] = row.isCounterLeg
      ? [row.otherAccountName, row.accountName]
      : [row.accountName, row.otherAccountName];
    return {
      ...summary,
      what: `Transferencia de ${amount} de ${from} a ${to}`,
      legs: `Se anulan sus dos partes: el dinero deja de salir de ${from} y de llegar a ${to}.`,
    };
  }

  summary.what = `${TRANSACTION_TYPE_LABELS[row.type]} de ${amount} en ${row.accountName}`;

  if (row.type === 'income' && row.orderNumber && row.walkInOrder) {
    summary.blocked =
      `Este cobro es de ${row.orderNumber}, una venta a «Clientes varios», que se paga en el acto y nunca debe: ` +
      `anulado, el pedido quedaría debiendo ${amount} a nombre de nadie, así que no se anula. ` +
      'Si el dinero entró en otra cuenta, corrígelo con una transferencia entre cuentas.';
  } else if (row.type === 'income' && row.orderNumber) {
    summary.consequence = `El pedido ${row.orderNumber} vuelve a deber ${amount}: si ya se entregó, aparece en Por cobrar.`;
  } else if (row.type === 'expense' && row.orderNumber) {
    summary.consequence = `El pedido ${row.orderNumber} vuelve a contar esos ${amount} como cobrados.`;
  } else if (row.type === 'expense' && row.purchaseId) {
    summary.consequence = `La compra vuelve a quedar por pagar en ${amount}.`;
  }

  return summary;
}
