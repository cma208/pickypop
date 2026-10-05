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
}

export type ResultTotals = Omit<MonthResult, 'month'>;

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
  };
}

/**
 * Net profit over sales, as a fraction. Null when there were no sales: a
 * margin over zero says nothing, and a dash reads better than an infinity.
 */
export function netMargin(row: Pick<MonthResult, 'sales' | 'netProfit'>): number | null {
  return row.sales === 0 ? null : row.netProfit / row.sales;
}
