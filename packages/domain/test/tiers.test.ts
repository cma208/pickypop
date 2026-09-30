import { describe, expect, it } from 'vitest';
import { priceForQuantity } from '../src/tiers.ts';
import type { PriceTier } from '../src/types.ts';

/** The ladder seeded for the potion bottle. */
const TIERS: PriceTier[] = [
  { minQuantity: 1, unitPrice: 10 },
  { minQuantity: 5, unitPrice: 9 },
  { minQuantity: 10, unitPrice: 8.5 },
];

describe('priceForQuantity', () => {
  it('charges the list price until the next threshold', () => {
    expect(priceForQuantity(TIERS, 1)).toBe(10);
    expect(priceForQuantity(TIERS, 4)).toBe(10);
  });

  it('applies each tier from its minimum upwards', () => {
    expect(priceForQuantity(TIERS, 5)).toBe(9);
    expect(priceForQuantity(TIERS, 9)).toBe(9);
    expect(priceForQuantity(TIERS, 10)).toBe(8.5);
    expect(priceForQuantity(TIERS, 200)).toBe(8.5);
  });

  it('does not care about the order the tiers come in', () => {
    const shuffled = [TIERS[2]!, TIERS[0]!, TIERS[1]!];

    expect(priceForQuantity(shuffled, 7)).toBe(9);
  });

  it('falls back to the list price when no tier applies', () => {
    expect(priceForQuantity([{ minQuantity: 5, unitPrice: 9 }], 2, 11)).toBe(11);
  });

  it('complains instead of guessing when there is no price at all', () => {
    expect(() => priceForQuantity([{ minQuantity: 5, unitPrice: 9 }], 2)).toThrow(RangeError);
    expect(() => priceForQuantity(TIERS, 0)).toThrow(RangeError);
  });
});
