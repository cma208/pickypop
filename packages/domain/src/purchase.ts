import { roundMoney, unitShare } from './money.ts';

/**
 * Spreads a purchase's shipping and other costs over its lines and over each
 * physical unit, so every spool carries what it really cost.
 *
 * All the arithmetic is done in whole cents and the remainders are handed out
 * one cent at a time (largest remainder), so the pieces always add up to the
 * exact amount that was paid: no cent is created or lost. Rounding each share
 * on its own would not guarantee that, and the kardex would drift from the
 * invoice by a cent here and there.
 */
export type AllocationMethod = 'by_amount' | 'by_weight';

export interface PlanLineInput {
  kind: 'sku' | 'item';
  quantity: number;
  unitPrice: number;
  /** Net weight of one unit in grams. Null for supplies, which have no known weight. */
  unitWeightG: number | null;
}

export interface PlanLine {
  /** The quantity as it is stored: three decimals. */
  quantity: number;
  /** The price per unit as it is stored: cents for a roll, six decimals for a supply. */
  unitPrice: number;
  subtotal: number;
  /** Share of shipping and other costs that landed on this line. */
  extra: number;
  total: number;
  /** Final cost of every unit of an SKU line (one entry per spool). Empty for items. */
  unitCosts: number[];
  /** Total divided by quantity, to 6 decimals. The cost of one unit as stored in the kardex. */
  effectiveUnitCost: number;
}

export interface PurchasePlan {
  lines: PlanLine[];
  subtotal: number;
  extra: number;
  total: number;
  /** The method that was really applied (weight falls back to amount when no line has a weight). */
  method: AllocationMethod;
  fellBack: boolean;
}

const CENTS_PER_SOL = 100;
const QUANTITY_SCALE = 1_000;
const PRICE_SCALE = 1_000_000;
/** From billionths of a sol (thousandths of a unit × millionths of a sol) to cents. */
const NANO_PER_CENT = 10_000_000n;

/**
 * What a purchase can hold before it stops being a purchase of this workshop
 * and becomes a typing mistake: ten billion grams of sweets went through once
 * and left a purchase with no lines (tercera pasada, T1-06). The database
 * applies the same caps in `register_purchase`; change them in both places.
 */
export const PURCHASE_LIMITS = {
  rollsPerLine: 500,
  quantityPerLine: 1_000_000,
  unitPrice: 100_000,
  /** Shipping, and other costs, each. */
  extraCost: 100_000,
  total: 1_000_000,
  /** What `purchase_lines` keeps. */
  quantityDecimals: 3,
  priceDecimals: 6,
  /** A roll is priced in cents: each spool carries a whole number of them. */
  rollPriceDecimals: 2,
} as const;

/** The quantity of a line as `purchase_lines.quantity` keeps it: three decimals. */
export function storedQuantity(quantity: number): number {
  return Number.isFinite(quantity) ? Math.round(quantity * QUANTITY_SCALE) / QUANTITY_SCALE : 0;
}

/**
 * The price per unit as it is stored and paid. A supply keeps six decimals,
 * the column's; a roll keeps cents, because each spool carries a whole number
 * of them. The preview has to multiply this one: with the raw 0.01500499 it
 * said S/ 15.00, the database kept 0.015005 and charged S/ 15.01 (T1-16).
 */
export function storedUnitPrice(kind: 'sku' | 'item', unitPrice: number): number {
  if (!Number.isFinite(unitPrice)) return 0;
  return kind === 'sku' ? roundMoney(unitPrice) : Math.round(unitPrice * PRICE_SCALE) / PRICE_SCALE;
}

/**
 * quantity × price in cents, rounded half away from zero exactly like the
 * database's `round(quantity * unit_price, 2)`. Done in integers: a float
 * product lands on either side of half a cent and would disagree with the
 * total the purchase is paid by.
 */
export function lineSubtotalCents(quantity: number, unitPrice: number): number {
  const nano =
    BigInt(Math.round(storedQuantity(quantity) * QUANTITY_SCALE)) *
    BigInt(Math.round((Number.isFinite(unitPrice) ? unitPrice : 0) * PRICE_SCALE));
  const magnitude = (nano < 0n ? -nano : nano) + NANO_PER_CENT / 2n;
  const cents = Number(magnitude / NANO_PER_CENT);
  return nano < 0n ? -cents : cents;
}

function toCents(amount: number): number {
  return Math.round(roundMoney(Number.isFinite(amount) ? amount : 0) * CENTS_PER_SOL);
}

function fromCents(cents: number): number {
  return roundMoney(cents / CENTS_PER_SOL);
}

/**
 * The price of one unit when what is known is what the whole line cost: the
 * invoice says S/ 15.00 for 1000 g, not S/ 0.015 per gram. Kept to the 6
 * decimals the stored unit price and the kardex have, so a cheap thing does
 * not round to zero and the line still adds up to what was paid.
 */
export function unitPriceFromLineTotal(lineTotal: number, quantity: number): number {
  if (!Number.isFinite(lineTotal) || !(quantity > 0)) return 0;
  return unitShare(roundMoney(lineTotal), quantity);
}

/** Splits `totalCents` in proportion to `weights`; the result always sums to `totalCents`. */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0 || totalCents <= 0) return weights.map(() => 0);

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  // Without any weight to go by, an even split is fairer than dropping the cost.
  const usable = weightSum > 0 ? weights : weights.map(() => 1);
  const usableSum = weightSum > 0 ? weightSum : usable.length;

  const raw = usable.map((weight) => (totalCents * weight) / usableSum);
  const shares = raw.map((value) => Math.floor(value));
  let remaining = totalCents - shares.reduce((sum, share) => sum + share, 0);

  // Biggest leftover first; ties go to the earlier line so the result is stable.
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    shares[index] += 1;
    remaining -= 1;
  }

  return shares;
}

export function planPurchase(
  lines: PlanLineInput[],
  shippingCost: number,
  otherCosts: number,
  requested: AllocationMethod,
): PurchasePlan {
  const stored = lines.map((line) => ({
    ...line,
    quantity: storedQuantity(line.quantity),
    unitPrice: storedUnitPrice(line.kind, line.unitPrice),
  }));
  const subtotalsCents = stored.map((line) => lineSubtotalCents(line.quantity, line.unitPrice));
  const extraCents = toCents(shippingCost) + toCents(otherCosts);

  const weights = stored.map((line) =>
    line.kind === 'sku' && line.unitWeightG ? line.quantity * line.unitWeightG : 0,
  );
  const hasWeights = weights.some((weight) => weight > 0);
  const method: AllocationMethod =
    requested === 'by_weight' && hasWeights ? 'by_weight' : 'by_amount';

  const lineExtras = allocateCents(extraCents, method === 'by_weight' ? weights : subtotalsCents);

  const planLines = stored.map((line, index): PlanLine => {
    const subtotalCents = subtotalsCents[index];
    const lineExtraCents = lineExtras[index];
    const totalCents = subtotalCents + lineExtraCents;

    const unitCosts =
      line.kind === 'sku' ? unitCostsFor(line.unitPrice, line.quantity, lineExtraCents) : [];

    return {
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: fromCents(subtotalCents),
      extra: fromCents(lineExtraCents),
      total: fromCents(totalCents),
      unitCosts,
      effectiveUnitCost:
        line.quantity > 0
          ? unitShare(totalCents / CENTS_PER_SOL, line.quantity)
          : 0,
    };
  });

  const subtotalCents = subtotalsCents.reduce((sum, cents) => sum + cents, 0);

  return {
    lines: planLines,
    subtotal: fromCents(subtotalCents),
    extra: fromCents(extraCents),
    total: fromCents(subtotalCents + extraCents),
    method,
    fellBack: requested === 'by_weight' && method === 'by_amount',
  };
}

/** One entry per spool: the unit price plus its own cent-exact share of the line's extra. */
function unitCostsFor(unitPrice: number, quantity: number, lineExtraCents: number): number[] {
  const units = Math.max(0, Math.round(quantity));
  const shares = allocateCents(lineExtraCents, Array<number>(units).fill(1));
  return shares.map((share) => fromCents(toCents(unitPrice) + share));
}
