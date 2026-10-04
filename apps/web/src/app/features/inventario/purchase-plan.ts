import { roundMoney } from '../../core/pricing';

/**
 * Spreads a purchase's shipping and other costs over its lines and over each
 * physical unit, so every spool carries what it really cost.
 *
 * All the arithmetic is done in whole cents and the remainders are handed out
 * one cent at a time (largest remainder), so the pieces always add up to the
 * exact amount that was paid: no cent is created or lost.
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

const COST_DECIMALS = 1_000_000;

function toCents(amount: number): number {
  return Math.round(roundMoney(Number.isFinite(amount) ? amount : 0) * 100);
}

function fromCents(cents: number): number {
  return roundMoney(cents / 100);
}

/** Splits `totalCents` in proportion to `weights`; the result always sums to `totalCents`. */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0 || totalCents <= 0) return weights.map(() => 0);

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const usable = weightSum > 0 ? weights : weights.map(() => 1);
  const usableSum = weightSum > 0 ? weightSum : usable.length;

  const raw = usable.map((weight) => (totalCents * weight) / usableSum);
  const shares = raw.map((value) => Math.floor(value));
  let remaining = totalCents - shares.reduce((sum, share) => sum + share, 0);

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
  const subtotalsCents = lines.map((line) => toCents(line.quantity * line.unitPrice));
  const extraCents = toCents(shippingCost) + toCents(otherCosts);

  const weights = lines.map((line) =>
    line.kind === 'sku' && line.unitWeightG ? line.quantity * line.unitWeightG : 0,
  );
  const hasWeights = weights.some((weight) => weight > 0);
  const method: AllocationMethod = requested === 'by_weight' && hasWeights ? 'by_weight' : 'by_amount';

  const lineExtras = allocateCents(extraCents, method === 'by_weight' ? weights : subtotalsCents);

  const planLines = lines.map((line, index): PlanLine => {
    const subtotalCents = subtotalsCents[index];
    const lineExtraCents = lineExtras[index];
    const totalCents = subtotalCents + lineExtraCents;

    const unitCosts =
      line.kind === 'sku' ? unitCostsFor(line.unitPrice, line.quantity, lineExtraCents) : [];

    return {
      subtotal: fromCents(subtotalCents),
      extra: fromCents(lineExtraCents),
      total: fromCents(totalCents),
      unitCosts,
      effectiveUnitCost:
        line.quantity > 0 ? Math.round((totalCents / 100 / line.quantity) * COST_DECIMALS) / COST_DECIMALS : 0,
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
