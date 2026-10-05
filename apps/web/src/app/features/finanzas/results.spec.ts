import { addUpMonths, netMargin, type MonthResult } from './results';

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
