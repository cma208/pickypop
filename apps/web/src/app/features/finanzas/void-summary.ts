import { money } from '../../core/format';
import { TRANSACTION_TYPE_LABELS, type TransactionType } from './finanzas.models';
import type { TransactionPreset } from './transaction-draft';

/** The part of a ledger row the voiding form describes. */
export interface VoidedRow {
  type: TransactionType;
  amount: number;
  accountId: string | null;
  accountName: string;
  otherAccountName: string | null;
  isCounterLeg: boolean;
  /** The order it collected or refunded. */
  orderNumber: string | null;
  /** That order is a sale to «Clientes varios», which never owes. */
  walkInOrder: boolean;
  /** The purchase it paid. */
  purchaseId: string | null;
  /** Already voided: from another tab, while this one still offered it. */
  voided: boolean;
  voidReason: string | null;
}

/** A way to set the book right when voiding is not it, ready for Caja's form. */
export interface VoidCorrection {
  /** «Si el dinero entró en otra cuenta». */
  when: string;
  /** What to register, and why that is the right record. */
  what: string;
  /** The button that opens Caja's form with it filled in. */
  action: string;
  preset: TransactionPreset;
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
  /** What to do instead, when it cannot be voided and something still has to be corrected. */
  corrections: VoidCorrection[];
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
 * refuses, and the form says so first, with what to do instead.
 */
export function voidSummary(row: VoidedRow): VoidSummary {
  const amount = money(row.amount);
  const summary: VoidSummary = { what: '', legs: null, consequence: null, blocked: null, corrections: [] };

  if (row.type === 'transfer' && row.otherAccountName) {
    const [from, to] = row.isCounterLeg
      ? [row.otherAccountName, row.accountName]
      : [row.accountName, row.otherAccountName];
    summary.what = `Transferencia de ${amount} de ${from} a ${to}`;
    summary.legs = `Se anulan sus dos partes: el dinero deja de salir de ${from} y de llegar a ${to}.`;
  } else {
    summary.what = `${TRANSACTION_TYPE_LABELS[row.type]} de ${amount} en ${row.accountName}`;
  }

  // Voided from another tab while this one still offered it (T5-10): said, and nothing to send.
  if (row.voided) {
    const reason = row.voidReason ? ` (motivo: «${row.voidReason}»)` : '';
    summary.blocked = `Este movimiento ya está anulado${reason}: ya no cuenta en ningún saldo, no hay nada más que anular.`;
    summary.legs = null;
    return summary;
  }

  if (row.type === 'transfer') return summary;

  if (row.type === 'income' && row.orderNumber && row.walkInOrder) {
    summary.blocked =
      `Este cobro es de ${row.orderNumber}, una venta a «Clientes varios», que se paga en el acto y nunca debe: ` +
      `anulado, el pedido quedaría debiendo ${amount} a nombre de nadie, así que no se anula.`;
    summary.corrections = walkInCorrections(row);
  } else if (row.type === 'income' && row.orderNumber) {
    summary.consequence = `El pedido ${row.orderNumber} vuelve a deber ${amount}: si ya se entregó, aparece en Por cobrar.`;
  } else if (row.type === 'expense' && row.orderNumber) {
    // A refund voided counts as collected again; the database refuses it when
    // the order would then be collected beyond its total.
    summary.consequence =
      `El pedido ${row.orderNumber} vuelve a contar esos ${amount} como cobrados. ` +
      'Si ya se volvió a cobrar, no se anula: quedaría cobrado de más.';
  } else if (row.type === 'expense' && row.purchaseId) {
    summary.consequence = `La compra vuelve a quedar por pagar en ${amount}.`;
  }

  return summary;
}

/**
 * The collection of a sale to «Clientes varios» is not voided (T5-05,
 * ADR-024), but the money it says came in may not be where it says. Two
 * things happen in a shop, and each has its record: it came into another
 * account, which is a transfer; or it never came (a Yape that did not go
 * through, a forged note), which is a loss, an expense of that account. The
 * sale itself did happen, and the goods left with it.
 */
function walkInCorrections(row: VoidedRow): VoidCorrection[] {
  if (!row.accountId) return [];
  const amount = money(row.amount);
  const base = { accountId: row.accountId, amount: row.amount };

  return [
    {
      when: 'Si el dinero entró en otra cuenta',
      what: `Regístralo como una transferencia de ${row.accountName} a la cuenta donde entró: el total del taller no cambia.`,
      action: 'Registrar la transferencia',
      preset: { ...base, type: 'transfer', note: `El cobro de ${row.orderNumber} entró en otra cuenta` },
    },
    {
      when: 'Si nunca llegó (un Yape que no entró, un billete falso)',
      what: `Registra un egreso de ${amount} en ${row.accountName}: la venta queda hecha y lo que no llegó queda como pérdida.`,
      action: 'Registrar el egreso',
      preset: { ...base, type: 'expense', note: `No llegó el cobro de ${row.orderNumber}` },
    },
  ];
}
