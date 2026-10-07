import { describe, expect, it } from 'vitest';
import { roundMoney, unitShare } from '../src/money.ts';

describe('unitShare', () => {
  it('keeps the share that rounding to cents would lose', () => {
    expect(unitShare(15.69, 2)).toBe(7.845);
    expect(roundMoney(unitShare(15.69, 2) * 2)).toBe(15.69);
  });

  it('gives back the batch to the cent for every quantity a workshop sells', () => {
    for (let units = 1; units <= 500; units++) {
      for (const total of [0.01, 15.69, 22.1, 66.12, 1234.57]) {
        expect(roundMoney(unitShare(total, units) * units)).toBe(total);
      }
    }
  });

  it('refuses a batch with no units', () => {
    expect(() => unitShare(10, 0)).toThrow(RangeError);
  });
});
