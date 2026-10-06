import { describe, expect, it } from 'vitest';
import { breakdownForPrice, calculatePrice, chargesIgv } from '../src/price.ts';
import type { CostProfile } from '../src/types.ts';

const PROFILE: CostProfile = {
  materialWasteRate: 0.03,
  failureRate: 0.1,
  laborRatePerHour: 12,
  energyRatePerKwh: 0.7556,
  targetMargin: 0.4,
  minOrderPrice: 5,
  roundingStep: 0.5,
  igvRate: 0.18,
  taxRegime: 'none',
};

describe('chargesIgv', () => {
  it('only charges IGV where SUNAT expects it', () => {
    expect(chargesIgv('none')).toBe(false);
    expect(chargesIgv('nrus')).toBe(false); // it is already inside the monthly quota
    expect(chargesIgv('rer')).toBe(true);
    expect(chargesIgv('rmt')).toBe(true);
    expect(chargesIgv('general')).toBe(true);
  });
});

describe('calculatePrice', () => {
  it('takes the margin over the price, not over the cost', () => {
    const price = calculatePrice(14.86, PROFILE);

    expect(price.basePrice).toBe(24.77); // 14.86 / 0.60, not 14.86 * 1.40
    expect(price.total).toBe(25);
    expect(price.effectiveMarginRate).toBeCloseTo(0.4, 3);
  });

  it('adds IGV under a regime that charges it', () => {
    const price = calculatePrice(14.86, { ...PROFILE, taxRegime: 'rer' });

    expect(price.saleValue).toBe(24.77);
    expect(price.igv).toBe(4.46);
    expect(price.totalBeforeRounding).toBe(29.23);
    expect(price.total).toBe(29.5);
  });

  it('prices the real Love potion plate at the workshop margin', () => {
    const price = calculatePrice(5, { ...PROFILE, targetMargin: 0.5 });

    expect(price.basePrice).toBe(10);
    expect(price.total).toBe(10); // exactly the S/ 10 they had in mind
  });

  it('never goes below the minimum order price', () => {
    const price = calculatePrice(1, PROFILE);

    expect(price.basePrice).toBe(1.67);
    expect(price.afterMinimum).toBe(5);
    expect(price.total).toBe(5);
  });

  it('grosses up the marketplace fee so it does not eat the margin', () => {
    const price = calculatePrice(14.86, PROFILE, { channelCommissionRate: 0.1 });

    expect(price.saleValue).toBe(27.52); // 24.77 / 0.90
    expect(price.total).toBe(28);
  });

  it('applies discounts and surcharges over the base price', () => {
    const price = calculatePrice(100, { ...PROFILE, roundingStep: 0 }, {
      volumeDiscountRate: 0.1,
      urgencySurchargeRate: 0.2,
    });

    expect(price.basePrice).toBe(166.67);
    expect(price.adjustedPrice).toBe(180); // 166.67 * 1.20 * 0.90
  });

  it('rounds the final price up, never down', () => {
    expect(calculatePrice(10, PROFILE).totalBeforeRounding).toBe(16.67);
    expect(calculatePrice(10, PROFILE).total).toBe(17);
  });

  it('rejects a margin of 100 %', () => {
    expect(() => calculatePrice(10, { ...PROFILE, targetMargin: 1 })).toThrow(RangeError);
  });
});

describe('breakdownForPrice', () => {
  it('keeps the price list as it is and says what margin it leaves', () => {
    const price = breakdownForPrice(4.22, 10, PROFILE);

    expect(price.total).toBe(10);
    expect(price.saleValue).toBe(10);
    expect(price.igv).toBe(0);
    expect(price.marginAmount).toBe(5.78);
    expect(price.effectiveMarginRate).toBeCloseTo(0.578, 3);
  });

  it('shows no discount: the tier already is the volume price', () => {
    const price = breakdownForPrice(4.22, 8.5, PROFILE);

    expect(price.basePrice - price.adjustedPrice).toBe(0);
  });

  it('takes IGV out of the total instead of adding it on top', () => {
    const price = breakdownForPrice(4.22, 11.8, { ...PROFILE, taxRegime: 'rer' });

    expect(price.total).toBe(11.8);
    expect(price.igv).toBe(1.8);
    expect(price.saleValue).toBe(10);
  });

  it('reports a negative margin when the list price is below the cost', () => {
    const price = breakdownForPrice(4.22, 3, PROFILE);

    expect(price.marginAmount).toBe(-1.22);
    expect(price.effectiveMarginRate).toBeLessThan(0);
  });

  it('refuses a negative price', () => {
    expect(() => breakdownForPrice(1, -1, PROFILE)).toThrow(RangeError);
  });
});
