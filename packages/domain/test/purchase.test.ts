import { describe, expect, it } from 'vitest';
import { allocateCents, planPurchase, unitPriceFromLineTotal } from '../src/purchase.ts';
import type { PlanLineInput } from '../src/purchase.ts';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('allocateCents', () => {
  it('always adds up to the total', () => {
    const shares = allocateCents(1000, [1, 1, 1]);
    expect(sum(shares)).toBe(1000);
    expect(shares).toEqual([334, 333, 333]);
  });

  it('splits evenly when every weight is zero', () => {
    expect(allocateCents(10, [0, 0])).toEqual([5, 5]);
  });

  it('hands the leftover cents to the biggest remainders, earlier lines first on a tie', () => {
    // 100 over 1:1:2 is 25, 25, 50 exactly; 101 leaves one cent to place.
    expect(allocateCents(101, [1, 1, 2])).toEqual([25, 25, 51]);
    expect(allocateCents(1, [1, 1, 1])).toEqual([1, 0, 0]);
  });

  it('gives nothing when there is nothing to split or nobody to split it with', () => {
    expect(allocateCents(0, [1, 2])).toEqual([0, 0]);
    expect(allocateCents(500, [])).toEqual([]);
  });

  it('never loses or invents a cent, whatever the weights', () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let round = 0; round < 500; round += 1) {
      const total = Math.floor(next() * 100000);
      const weights = Array.from({ length: 1 + Math.floor(next() * 8) }, () =>
        Math.round(next() * 100000) / 100,
      );
      expect(sum(allocateCents(total, weights))).toBe(total);
    }
  });
});

describe('planPurchase', () => {
  const sku = (quantity: number, unitPrice: number, unitWeightG = 1000): PlanLineInput => ({
    kind: 'sku',
    quantity,
    unitPrice,
    unitWeightG,
  });

  it('spreads shipping by amount and keeps the total exact', () => {
    const plan = planPurchase([sku(2, 50), sku(1, 100)], 20, 0, 'by_amount');
    expect(plan.lines.map((line) => line.extra)).toEqual([10, 10]);
    expect(plan.lines[0]?.unitCosts).toEqual([55, 55]);
    expect(plan.lines[1]?.unitCosts).toEqual([110]);
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
    expect(plan.lines[0]?.total).toBe(25);
    expect(plan.lines[0]?.effectiveUnitCost).toBe(2.5);
  });

  it('gives each spool of a line a cent-exact share', () => {
    const plan = planPurchase([sku(3, 50)], 10, 0, 'by_amount');
    expect(plan.lines[0]?.unitCosts).toEqual([53.34, 53.33, 53.33]);
    expect(plan.lines[0]?.unitCosts.reduce((a, b) => a + b, 0)).toBeCloseTo(160, 2);
  });

  it('shares that do not divide evenly still add up to the shipping, by amount and by weight', () => {
    const lines = [sku(3, 41.37, 1000), sku(2, 59.99, 750), sku(1, 12.5, 250)];

    for (const method of ['by_amount', 'by_weight'] as const) {
      const plan = planPurchase(lines, 17.77, 3.33, method);

      expect(Math.round(sum(plan.lines.map((line) => line.extra)) * 100)).toBe(2110);
      expect(plan.extra).toBe(21.1);
      expect(Math.round(sum(plan.lines.map((line) => line.total)) * 100)).toBe(
        Math.round(plan.total * 100),
      );
    }
  });

  it('adds the spool costs of a line up to the line total, to the cent', () => {
    const plan = planPurchase([sku(7, 33.33)], 10, 0, 'by_amount');
    const [line] = plan.lines;

    expect(Math.round(sum(line?.unitCosts ?? []) * 100)).toBe(Math.round((line?.total ?? 0) * 100));
  });
});

describe('unitPriceFromLineTotal', () => {
  it('gives the price of a gram from what the invoice says for a kilo', () => {
    expect(unitPriceFromLineTotal(15, 1000)).toBe(0.015);
    expect(unitPriceFromLineTotal(7.5, 100)).toBe(0.075);
  });

  it('keeps six decimals, not two', () => {
    expect(unitPriceFromLineTotal(10, 3)).toBe(3.333333);
    expect(unitPriceFromLineTotal(100, 3000)).toBe(0.033333);
  });

  it('rounds the total to cents first: it is money that was paid', () => {
    expect(unitPriceFromLineTotal(15.004, 1000)).toBe(0.015);
  });

  it('is zero when it cannot be known', () => {
    expect(unitPriceFromLineTotal(15, 0)).toBe(0);
    expect(unitPriceFromLineTotal(15, -2)).toBe(0);
    expect(unitPriceFromLineTotal(Number.NaN, 5)).toBe(0);
  });

  it('gives back the total that was paid once multiplied by the quantity', () => {
    const quantities = [1, 2, 3, 7, 20, 150, 1000, 2500, 5000];
    const totals = [0.01, 1, 9.99, 15, 33.33, 123.45, 1999.99];

    for (const quantity of quantities) {
      for (const total of totals) {
        const price = unitPriceFromLineTotal(total, quantity);
        const plan = planPurchase([{ kind: 'item', quantity, unitPrice: price, unitWeightG: null }], 0, 0, 'by_amount');
        expect(plan.lines[0]!.subtotal, `${quantity} for ${total}`).toBe(total);
      }
    }
  });
});
