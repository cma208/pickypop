import type { PriceTier } from './types.ts';

/**
 * Unit price for a quantity: the cheapest tier whose minimum is reached.
 *
 * Tiers exist because making one unit from scratch is dear — a whole plate of
 * caps gets printed for a single bottle — while the same unit inside a batch
 * of ten is much cheaper. Single sales are meant to come out of stock.
 */
export function priceForQuantity(
  tiers: PriceTier[],
  quantity: number,
  listPrice?: number,
): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError('quantity must be a positive whole number');
  }

  const applicable = tiers
    .filter((tier) => tier.minQuantity <= quantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];

  if (applicable !== undefined) return applicable.unitPrice;
  if (listPrice !== undefined) return listPrice;

  throw new RangeError(`no price tier covers a quantity of ${quantity} and there is no list price`);
}
