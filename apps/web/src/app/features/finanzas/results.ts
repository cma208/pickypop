import { sumMoney } from '../../core/pricing';

/** One month of the income statement, as the view reports it. */
export interface MonthResult {
  month: string;
  sales: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  /** Gross profit, less expenses and unsold production, plus other income. */
  netProfit: number;
  /**
   * Money in that settles no order and is not capital: a refund, a supplier
   * giving money back. It adds to the net profit on its own line (E5-01).
   * Sales go through orders, which carry their cost.
   */
  otherIncome: number;
  /** Reported apart, never subtracted. See `netMargin` and the screen. */
  inventoryPurchases: number;
  ownerContributions: number;
  ownerDraws: number;
  /**
   * Printed and never sold: `toolsAndTests`, `shelfCountLosses` and
   * `uncoveredFailedPrints`. Subtracted (ADR-023).
   */
  unsoldProduction: number;
  /**
   * Moulds, jigs and test prints: jobs of no order that put nothing on the
   * shelf, their failed tries included. No allowance pays for those tries, so
   * they are what the tool cost, not a failure of production.
   */
  toolsAndTests: number;
  /** What the shelf count found missing, less what it found over. */
  shelfCountLosses: number;
  /**
   * Failed prints of production, held against `printCost` and the failure
   * allowance the prices carry. The ones no estimate pays for also subtract,
   * as `uncoveredFailedPrints`; the rest are paid by the allowance of the
   * estimate a sale's line is still costed at.
   */
  failedPrints: number;
  /**
   * Failed prints no estimate pays for: the shelf's (what is sold off it costs
   * what left it, and a failed try never reaches it), a gift's, a cancelled
   * order's. Part of `unsoldProduction`, so subtracted.
   */
  uncoveredFailedPrints: number;
  /**
   * What was printed to produce that month, failures included: what the
   * failures are measured against. Moulds and tests do not carry the
   * allowance, so they are left out, failed or not (E3-02, ADR-023).
   */
  printCost: number;
  /** The failure allowance the prices carried that month, as a fraction. */
  failureReserveRate: number | null;
}

/** A rate is not added up: the period's totals leave it out. */
export type ResultTotals = Omit<MonthResult, 'month' | 'failureReserveRate'>;

const EMPTY: ResultTotals = {
  sales: 0,
  costOfSales: 0,
  grossProfit: 0,
  operatingExpenses: 0,
  netProfit: 0,
  otherIncome: 0,
  inventoryPurchases: 0,
  ownerContributions: 0,
  ownerDraws: 0,
  unsoldProduction: 0,
  toolsAndTests: 0,
  shelfCountLosses: 0,
  failedPrints: 0,
  uncoveredFailedPrints: 0,
  printCost: 0,
};

/** Adds the months on screen into one column, cent by cent. */
export function addUpMonths(rows: readonly MonthResult[]): ResultTotals {
  if (rows.length === 0) return { ...EMPTY };

  const total = (pick: (row: MonthResult) => number) => sumMoney(rows.map(pick));

  return {
    sales: total((row) => row.sales),
    costOfSales: total((row) => row.costOfSales),
    grossProfit: total((row) => row.grossProfit),
    operatingExpenses: total((row) => row.operatingExpenses),
    netProfit: total((row) => row.netProfit),
    otherIncome: total((row) => row.otherIncome),
    inventoryPurchases: total((row) => row.inventoryPurchases),
    ownerContributions: total((row) => row.ownerContributions),
    ownerDraws: total((row) => row.ownerDraws),
    unsoldProduction: total((row) => row.unsoldProduction),
    toolsAndTests: total((row) => row.toolsAndTests),
    shelfCountLosses: total((row) => row.shelfCountLosses),
    failedPrints: total((row) => row.failedPrints),
    uncoveredFailedPrints: total((row) => row.uncoveredFailedPrints),
    printCost: total((row) => row.printCost),
  };
}

/**
 * Net profit over sales, as a fraction. Null when there were no sales: a
 * margin over zero says nothing, and a dash reads better than an infinity.
 */
export function netMargin(row: Pick<MonthResult, 'sales' | 'netProfit'>): number | null {
  return row.sales === 0 ? null : row.netProfit / row.sales;
}

/**
 * What failed over what was printed to produce, both in cost, as a fraction:
 * the figure to hold against the failure allowance. The price carries
 * production / (1 − rate), so the allowance covers the month while
 * failed / (succeeded + failed) stays at or under the rate. Null when nothing
 * was printed to produce.
 */
export function failedShare(row: Pick<MonthResult, 'failedPrints' | 'printCost'>): number | null {
  return row.printCost === 0 ? null : row.failedPrints / row.printCost;
}

/** True when the allowance covered the failures, false when it fell short, null when there is nothing to compare. */
export function reserveCovers(row: Pick<MonthResult, 'failedPrints' | 'printCost' | 'failureReserveRate'>): boolean | null {
  const share = failedShare(row);
  if (share === null || row.failureReserveRate === null) return null;
  return share <= row.failureReserveRate;
}

/**
 * The «−» in front of what a line takes away. Only when it takes something:
 * a month without expenses read «−S/ 0.00» (E5-07).
 */
export function subtractedSign(value: number): string {
  return value > 0 ? '−' : '';
}

/** The «+» in front of what a line adds, like other income. Only when it adds something. */
export function addedSign(value: number): string {
  return value > 0 ? '+' : '';
}
