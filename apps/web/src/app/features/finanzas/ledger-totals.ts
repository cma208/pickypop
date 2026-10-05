import { sumMoney } from '../../core/pricing';
import type { TransactionType } from './finanzas.models';

/** The part of a ledger row the totals care about. */
export interface LedgerAmount {
  transactionId: string;
  type: TransactionType;
  signedAmount: number;
  amount: number;
  voided: boolean;
}

export interface LedgerTotals {
  inflow: number;
  outflow: number;
  net: number;
  /** Transfers are counted apart: they move money without earning or spending it. */
  transfers: number;
  transferAmount: number;
  voided: number;
}

/**
 * Adds up what is on screen. Transfers are left out of the inflow and the
 * outflow on purpose: without an account filter they show up twice, once
 * leaving and once arriving, and counting them would inflate both sides of a
 * total that nets to zero anyway. Voided rows are worth nothing.
 */
export function ledgerTotals(rows: readonly LedgerAmount[]): LedgerTotals {
  const live = rows.filter((row) => !row.voided);
  const moves = live.filter((row) => row.type !== 'transfer');

  const inflow = sumMoney(moves.filter((row) => row.signedAmount > 0).map((row) => row.signedAmount));
  const outflow = sumMoney(moves.filter((row) => row.signedAmount < 0).map((row) => -row.signedAmount));

  // One transfer is two legs, so it is counted once by its id.
  const transfers = new Map(
    live.filter((row) => row.type === 'transfer').map((row) => [row.transactionId, row.amount]),
  );

  return {
    inflow,
    outflow,
    net: sumMoney([inflow, -outflow]),
    transfers: transfers.size,
    transferAmount: sumMoney([...transfers.values()]),
    voided: new Set(rows.filter((row) => row.voided).map((row) => row.transactionId)).size,
  };
}

/**
 * Marks the one leg of each movement that carries the "anular" button. A
 * transfer shows twice when no account is picked, and offering to annul the
 * same row from both sides only invites a double click; filtered down to the
 * arriving side, that side has to carry it.
 */
export function markVoidable<T extends { transactionId: string; voided: boolean }>(
  rows: readonly T[],
): (T & { canVoid: boolean })[] {
  const offered = new Set<string>();

  return rows.map((row) => {
    const canVoid = !row.voided && !offered.has(row.transactionId);
    if (canVoid) offered.add(row.transactionId);
    return { ...row, canVoid };
  });
}
