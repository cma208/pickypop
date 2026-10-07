import { money as formatMoney, unitPrice as formatUnitPrice } from './format';

/** Intl puts a no-break space between «S/» and the number; the assertions read it as a plain one. */
const plain = (text: string) => text.replace(/\u00a0/g, ' ');
const unitPrice = (amount: Parameters<typeof formatUnitPrice>[0]) => plain(formatUnitPrice(amount));
const money = (amount: number) => plain(formatMoney(amount));

describe('unitPrice', () => {
  it('keeps the decimals a price per gram really has', () => {
    expect(unitPrice(0.015)).toBe('S/ 0.015');
    expect(unitPrice(0.033333)).toBe('S/ 0.033333');
  });

  it('shows cents when there is nothing finer, with no zeros to spare', () => {
    expect(unitPrice(2.5)).toBe('S/ 2.50');
    expect(unitPrice(53.13)).toBe('S/ 53.13');
    expect(unitPrice(0.3)).toBe('S/ 0.30');
    expect(unitPrice(12)).toBe('S/ 12.00');
  });

  it('does not show more than the six decimals that are stored', () => {
    expect(unitPrice(0.0333333333)).toBe('S/ 0.033333');
  });

  it('reads a numeric column that arrives as a string', () => {
    expect(unitPrice('0.015000')).toBe('S/ 0.015');
  });

  it('shows a dash when there is no price', () => {
    expect(unitPrice(null)).toBe('—');
    expect(unitPrice(undefined)).toBe('—');
    expect(unitPrice('')).toBe('—');
    expect(unitPrice(Number.NaN)).toBe('—');
  });

  it('is what makes «1000 g × S/ 0.015 = S/ 15.00» add up on screen, where money() rounds the price', () => {
    expect(money(0.015)).toBe('S/ 0.02');
    expect(unitPrice(0.015)).toBe('S/ 0.015');
  });
});
