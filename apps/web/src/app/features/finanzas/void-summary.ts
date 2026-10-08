import { money } from '../../core/format';
import { TRANSACTION_TYPE_LABELS, type TransactionType } from './finanzas.models';

/** The part of a ledger row the voiding form describes. */
export interface VoidedRow {
  type: TransactionType;
  amount: number;
  accountName: string;
  otherAccountName: string | null;
  isCounterLeg: boolean;
}

export interface VoidSummary {
  /** «Egreso de S/ 4.00 en Efectivo», «Transferencia de S/ 30.00 de Yape a Efectivo». */
  what: string;
  /** For a transfer: that both of its legs go, not only the one clicked. */
  legs: string | null;
}

/**
 * What is about to be annulled, in words. A transfer is one row with two
 * legs, and the form used to name only the leg it was opened from: «Viene de
 * Yape» read as a movement of Efectivo alone (E5-06). It names both accounts
 * in the direction the money went, whichever leg was clicked.
 */
export function voidSummary(row: VoidedRow): VoidSummary {
  const amount = money(row.amount);

  if (row.type === 'transfer' && row.otherAccountName) {
    const [from, to] = row.isCounterLeg
      ? [row.otherAccountName, row.accountName]
      : [row.accountName, row.otherAccountName];
    return {
      what: `Transferencia de ${amount} de ${from} a ${to}`,
      legs: `Se anulan sus dos partes: el dinero deja de salir de ${from} y de llegar a ${to}.`,
    };
  }

  return { what: `${TRANSACTION_TYPE_LABELS[row.type]} de ${amount} en ${row.accountName}`, legs: null };
}
