import { addUpMonths, failedShare, netMargin, reserveCovers, subtractedSign, type MonthResult } from './results';

function month(overrides: Partial<MonthResult> = {}): MonthResult {
  return {
    month: '2026-10-01',
    sales: 1000,
    costOfSales: 400,
    grossProfit: 600,
    operatingExpenses: 100,
    netProfit: 500,
    otherIncome: 0,
    inventoryPurchases: 0,
    ownerContributions: 0,
    ownerDraws: 0,
    unsoldProduction: 0,
    toolsAndTests: 0,
    shelfCountLosses: 0,
    failedPrints: 0,
    printCost: 0,
    failureReserveRate: 0.1,
    ...overrides,
  };
}

describe('addUpMonths', () => {
  it('adds every column of the period', () => {
    const totals = addUpMonths([
      month(),
      month({ month: '2026-09-01', sales: 500.55, costOfSales: 200.2, grossProfit: 300.35, operatingExpenses: 50.1, netProfit: 250.25 }),
    ]);

    expect(totals.sales).toBe(1500.55);
    expect(totals.costOfSales).toBe(600.2);
    expect(totals.grossProfit).toBe(900.35);
    expect(totals.operatingExpenses).toBe(150.1);
    expect(totals.netProfit).toBe(750.25);
  });

  it('keeps the figures reported apart out of the bottom line', () => {
    const totals = addUpMonths([
      month({ inventoryPurchases: 300, ownerContributions: 1000, ownerDraws: 200, otherIncome: 50 }),
    ]);

    expect(totals.netProfit).toBe(500);
    expect(totals.inventoryPurchases).toBe(300);
    expect(totals.ownerContributions).toBe(1000);
    expect(totals.ownerDraws).toBe(200);
    expect(totals.otherIncome).toBe(50);
  });

  it('adds what was printed and never sold, and the failures apart', () => {
    const totals = addUpMonths([
      month({ unsoldProduction: 7.77, toolsAndTests: 7.72, shelfCountLosses: 0.05, failedPrints: 0.28, printCost: 11.07 }),
      month({ month: '2026-09-01', unsoldProduction: -0.5, shelfCountLosses: -0.5, printCost: 3.1 }),
    ]);

    expect(totals.unsoldProduction).toBe(7.27);
    expect(totals.toolsAndTests).toBe(7.72);
    expect(totals.shelfCountLosses).toBe(-0.45);
    expect(totals.failedPrints).toBe(0.28);
    expect(totals.printCost).toBe(14.17);
    expect('failureReserveRate' in totals).toBe(false);
  });

  it('answers zeros for an empty period', () => {
    expect(addUpMonths([]).sales).toBe(0);
    expect(addUpMonths([]).netProfit).toBe(0);
  });
});

describe('netMargin', () => {
  it('is the net profit over the sales', () => {
    expect(netMargin({ sales: 1000, netProfit: 250 })).toBe(0.25);
  });

  it('has no answer when nothing was sold', () => {
    expect(netMargin({ sales: 0, netProfit: -100 })).toBeNull();
  });
});

describe('failedShare', () => {
  it('is what failed over what was printed to produce', () => {
    // Three plates of parts (0.71, 0.48, 0.68) and the failure itself: the mould is not in print_cost (E3-02).
    expect(failedShare({ failedPrints: 0.28, printCost: 2.15 })).toBeCloseTo(0.1302, 4);
  });

  it('has no answer when nothing was printed', () => {
    expect(failedShare({ failedPrints: 0, printCost: 0 })).toBeNull();
  });
});

describe('reserveCovers', () => {
  it('falls short when the failures weigh more than the allowance', () => {
    expect(reserveCovers({ failedPrints: 0.28, printCost: 2.15, failureReserveRate: 0.1 })).toBe(false);
  });

  it('covers a month whose failures stay within the allowance, the edge included', () => {
    expect(reserveCovers({ failedPrints: 0.1, printCost: 2, failureReserveRate: 0.1 })).toBe(true);
    expect(reserveCovers({ failedPrints: 0.2, printCost: 2, failureReserveRate: 0.1 })).toBe(true);
  });

  it('has no answer without prints or without an allowance', () => {
    expect(reserveCovers({ failedPrints: 0, printCost: 0, failureReserveRate: 0.1 })).toBeNull();
    expect(reserveCovers({ failedPrints: 0.1, printCost: 2, failureReserveRate: null })).toBeNull();
  });
});

describe('subtractedSign', () => {
  it('puts a minus only in front of what takes something away (E5-07)', () => {
    expect(subtractedSign(18.69)).toBe('−');
    expect(subtractedSign(0)).toBe('');
  });
});
