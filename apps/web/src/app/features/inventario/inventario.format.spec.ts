import { dayKey, plainDate, signedQuantity } from './inventario.format';

describe('signedQuantity', () => {
  it('shows an explicit sign and unit', () => {
    expect(signedQuantity(250, 'g')).toBe('+250 g');
    expect(signedQuantity(-250, 'g')).toBe('−250 g');
  });
});

describe('plainDate', () => {
  it('keeps the calendar day of a date column (no UTC shift)', () => {
    expect(plainDate('2026-09-01')).toContain('01');
    expect(plainDate('2026-09-01')).not.toContain('31');
  });

  it('returns a dash for missing values', () => {
    expect(plainDate(null)).toBe('—');
  });
});

describe('dayKey', () => {
  it('cuts the day at midnight in Lima', () => {
    // 03:00 UTC is 22:00 of the previous day in Lima (UTC-5).
    expect(dayKey('2026-10-02T03:00:00Z')).toBe('2026-10-01');
  });
});
