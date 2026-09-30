import { roundMoney, roundUpToStep } from './money.ts';
import type { CostProfile, PriceBreakdown, PriceOptions, TaxRegime } from './types.ts';

const REGIMES_CHARGING_IGV: ReadonlySet<TaxRegime> = new Set<TaxRegime>(['rer', 'rmt', 'general']);

/** Without a RUC there is no IGV, and under NRUS it is already inside the monthly quota. */
export function chargesIgv(regime: TaxRegime): boolean {
  return REGIMES_CHARGING_IGV.has(regime);
}

/**
 * Turns a cost into a price, following docs/02-dominio.md section 2.5.
 * The margin is taken over the price: cost / (1 - margin), never cost * (1 + margin).
 */
export function calculatePrice(
  cost: number,
  profile: CostProfile,
  options: PriceOptions = {},
): PriceBreakdown {
  if (profile.targetMargin < 0 || profile.targetMargin >= 1) {
    throw new RangeError('targetMargin must be between 0 and 1 (exclusive)');
  }
  const commission = options.channelCommissionRate ?? 0;
  if (commission < 0 || commission >= 1) {
    throw new RangeError('channelCommissionRate must be between 0 and 1 (exclusive)');
  }

  const basePrice = roundMoney(cost / (1 - profile.targetMargin));

  const adjustedPrice = roundMoney(
    basePrice *
      (options.clientFactor ?? 1) *
      (1 + (options.urgencySurchargeRate ?? 0)) *
      (1 - (options.volumeDiscountRate ?? 0)),
  );

  const afterMinimum = Math.max(adjustedPrice, profile.minOrderPrice);
  const saleValue = commission > 0 ? roundMoney(afterMinimum / (1 - commission)) : afterMinimum;

  const igv = chargesIgv(profile.taxRegime) ? roundMoney(saleValue * profile.igvRate) : 0;
  const totalBeforeRounding = roundMoney(saleValue + igv);

  return {
    cost,
    basePrice,
    adjustedPrice,
    afterMinimum,
    saleValue,
    igv,
    totalBeforeRounding,
    total: roundUpToStep(totalBeforeRounding, profile.roundingStep),
    marginAmount: roundMoney(saleValue - cost),
    effectiveMarginRate: saleValue > 0 ? (saleValue - cost) / saleValue : 0,
  };
}
