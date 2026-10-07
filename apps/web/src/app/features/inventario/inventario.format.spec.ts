import { dayKey, plainDate, quantity, signedQuantity, sourceLabel } from './inventario.format';

describe('signedQuantity', () => {
  it('shows an explicit sign and unit', () => {
    expect(signedQuantity(250, 'g')).toBe('+250 g');
    expect(signedQuantity(-250, 'g')).toBe('−250 g');
  });

  it('says "unidades" for anything but one', () => {
    expect(signedQuantity(50, 'unidad')).toBe('+50 unidades');
    expect(signedQuantity(-1, 'unidad')).toBe('−1 unidad');
  });
});

describe('quantity', () => {
  it('makes plural only the word the app writes itself', () => {
    expect(quantity(60, 'unidad')).toBe('60 unidades');
    expect(quantity(1, 'unidad')).toBe('1 unidad');
    expect(quantity(2, 'par')).toBe('2 par');
  });
});

describe('sourceLabel', () => {
  it('names in Spanish where an assembly or a maintenance came from', () => {
    expect(sourceLabel('assembly')).toBe('Armado');
    expect(sourceLabel('maintenance')).toBe('Mantenimiento');
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
