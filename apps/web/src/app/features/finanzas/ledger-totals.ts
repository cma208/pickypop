import { sumMoney } from '../../core/pricing';
import type { TransactionType } from './finanzas.models';
import { beforeOpening } from './opening-balance';

/** The part of a ledger row the totals care about. */
export interface LedgerAmount {
  transactionId: string;
  type: TransactionType;
  signedAmount: number;
  amount: number;
  voided: boolean;
  /** Dated before its account's opening: inside that opening balance, it moves nothing. */
  beforeOpening: boolean;
  /** The same, for the other leg of a transfer. */
  otherBeforeOpening: boolean;
}

export interface LedgerTotals {
  inflow: number;
  outflow: number;
  net: number;
  /** Transfers are counted apart: they move money without earning or spending it. */
  transfers: number;
  transferAmount: number;
  /**
   * Transfers with one leg dated before its account's opening and the other
   * not: only one balance moves, so the workshop's total does (E5-02).
   */
  transfersMovingTotal: number;
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
  const liveTransfers = live.filter((row) => row.type === 'transfer');
  const transfers = new Map(liveTransfers.map((row) => [row.transactionId, row.amount]));
  const movingTotal = new Set(
    liveTransfers.filter((row) => row.beforeOpening !== row.otherBeforeOpening).map((row) => row.transactionId),
  );

  return {
    inflow,
    outflow,
    net: sumMoney([inflow, -outflow]),
    transfers: transfers.size,
    transferAmount: sumMoney([...transfers.values()]),
    transfersMovingTotal: movingTotal.size,
    voided: new Set(rows.filter((row) => row.voided).map((row) => row.transactionId)).size,
  };
}

/**
 * What the totals box says next to the transfers. «No cambian el total» is
 * only true while every transfer moves both balances or neither. A leg dated
 * before its account's opening leaves that balance alone, and then the other
 * leg moves the workshop's total by itself (E5-02).
 */
export function transfersCaption(totals: Pick<LedgerTotals, 'transfers' | 'transfersMovingTotal'>): {
  label: string;
  note: string | null;
} {
  const moving = totals.transfersMovingTotal;
  if (moving === 0) return { label: 'Transferencias (no cambian el total)', note: null };

  const note =
    totals.transfers === 1
      ? 'Una de sus patas es anterior a la apertura de su cuenta: cambia el total del taller.'
      : moving === 1
        ? 'Una tiene una pata anterior a la apertura de su cuenta: esa sí cambia el total del taller.'
        : `${moving} tienen una pata anterior a la apertura de su cuenta: esas sí cambian el total del taller.`;
  return { label: 'Transferencias', note };
}

/** Identifies one leg of a movement: a transfer has two under the same id. */
export function legKey(transactionId: string, isCounterLeg: boolean): string {
  return `${transactionId}:${isCounterLeg ? 'in' : 'out'}`;
}

/**
 * Whether the other leg of a transfer is dated before its own account's
 * opening. The database says it of every leg it returns, and it is the one
 * to believe. A book filtered by account only brings this account's leg, so
 * the other one is judged with the same rule from its account's opening day.
 */
export function otherLegBeforeOpening(
  leg: { transactionId: string; isCounterLeg: boolean; occurredAt: string },
  legs: ReadonlyMap<string, boolean>,
  otherOpeningOn: string | null,
): boolean {
  const known = legs.get(legKey(leg.transactionId, !leg.isCounterLeg));
  if (known !== undefined) return known;
  return otherOpeningOn !== null && beforeOpening(leg.occurredAt, otherOpeningOn);
}

/** What decides where a row sits in the book. */
export interface LedgerPlace {
  occurredAt: string;
  transactionId: string;
  isCounterLeg: boolean;
}

/**
 * Newest first. The form saves to the minute, so two movements often share
 * it: they are then kept apart by their id, which keeps the two legs of a
 * transfer together («Va a…» right before «Viene de…») instead of letting an
 * expense of that same minute slip between them (E5-13).
 */
export function ledgerOrder(a: LedgerPlace, b: LedgerPlace): number {
  return (
    b.occurredAt.localeCompare(a.occurredAt) ||
    a.transactionId.localeCompare(b.transactionId) ||
    Number(a.isCounterLeg) - Number(b.isCounterLeg)
  );
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
