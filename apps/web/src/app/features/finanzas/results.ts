import { sumMoney } from '../../core/pricing';

/** One month of the income statement, as the view reports it. */
export interface MonthResult {
  month: string;
  sales: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  /** Income that is not a sale: nothing to do with an order. */
  otherIncome: number;
  /** Reported apart, never subtracted. See `netMargin` and the screen. */
  inventoryPurchases: number;
  ownerContributions: number;
  ownerDraws: number;
  /** Printed and never sold: `toolsAndTests` plus `shelfCountLosses`. Subtracted (ADR-023). */
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
   * Failed prints of production. Reported apart, never subtracted: the
   * failure allowance in the cost of sales pays for them.
   */
  failedPrints: number;
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
