import { allocateCents, planPurchase } from './purchase-plan';

describe('allocateCents', () => {
  it('always adds up to the total', () => {
    const shares = allocateCents(1000, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shares).toEqual([334, 333, 333]);
  });

  it('splits evenly when every weight is zero', () => {
    expect(allocateCents(10, [0, 0])).toEqual([5, 5]);
  });
});

describe('planPurchase', () => {
  const sku = (quantity: number, unitPrice: number, unitWeightG = 1000) => ({
    kind: 'sku' as const,
    quantity,
    unitPrice,
    unitWeightG,
  });

  it('spreads shipping by amount and keeps the total exact', () => {
    const plan = planPurchase([sku(2, 50), sku(1, 100)], 20, 0, 'by_amount');
    expect(plan.lines.map((line) => line.extra)).toEqual([10, 10]);
    expect(plan.lines[0].unitCosts).toEqual([55, 55]);
    expect(plan.lines[1].unitCosts).toEqual([110]);
    expect(plan.total).toBe(220);
  });

  it('spreads by weight when asked', () => {
    const plan = planPurchase([sku(1, 50, 1000), sku(1, 50, 500)], 15, 0, 'by_weight');
    expect(plan.lines.map((line) => line.extra)).toEqual([10, 5]);
  });

  it('falls back to amount when no line has a weight', () => {
    const plan = planPurchase(
      [{ kind: 'item', quantity: 10, unitPrice: 2, unitWeightG: null }],
      5,
      0,
      'by_weight',
    );
    expect(plan.method).toBe('by_amount');
    expect(plan.fellBack).toBe(true);
    expect(plan.lines[0].total).toBe(25);
    expect(plan.lines[0].effectiveUnitCost).toBe(2.5);
  });

  it('gives each spool of a line a cent-exact share', () => {
    const plan = planPurchase([sku(3, 50)], 10, 0, 'by_amount');
    expect(plan.lines[0].unitCosts).toEqual([53.34, 53.33, 53.33]);
    expect(plan.lines[0].unitCosts.reduce((a, b) => a + b, 0)).toBeCloseTo(160, 2);
  });
});
