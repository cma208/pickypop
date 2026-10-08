import { FormControl } from '@angular/forms';
import { requiredText, wholeNumber } from '../../core/form-errors';
import { addLineBlockers, clampPercent, losingLines, QUOTE_FIELD_ERRORS, validUntilFor } from './quote-form';

describe('quote form rules', () => {
  it('asks for whole units: 2.5 is not quoted as 3 (T4-13)', () => {
    expect(wholeNumber(new FormControl(3))).toBeNull();
    const errors = wholeNumber(new FormControl(2.5)) ?? {};
    // The message is read by the key the shared validator gives.
    const [key] = Object.keys(errors);
    expect(QUOTE_FIELD_ERRORS['quantity']![key!]).toContain('número entero');
    expect(QUOTE_FIELD_ERRORS['validityDays']![key!]).toContain('número entero');
  });

  it('says a description of only spaces is missing, by the key requiredText gives', () => {
    const errors = requiredText(new FormControl('   ')) ?? {};
    const [key] = Object.keys(errors);
    expect(QUOTE_FIELD_ERRORS['description']![key!]).toContain('Escribe qué se cotiza');
  });

  it('says the discount range instead of cutting it silently (T4-14)', () => {
    expect(QUOTE_FIELD_ERRORS['volumeDiscountPercent']!['max']).toContain('0 % a 90 %');
    expect(clampPercent(150, 90)).toBe(90);
    expect(clampPercent(-50, 90)).toBe(0);
    expect(clampPercent(Number.NaN, 90)).toBe(0);
  });

  it('asks for the customer: a quote always has a name', () => {
    expect(QUOTE_FIELD_ERRORS['customerId']!['required']).toContain('siempre lleva un nombre');
  });
});

describe('addLineBlockers', () => {
  const fine = {
    lineErrors: { description: false, quantity: false, minutes: false },
    priceInvalid: false,
    plates: 1,
    calculated: true,
    missingSkus: 0,
  };

  it('lets a complete line be added', () => {
    expect(addLineBlockers(fine)).toEqual([]);
  });

  it('says why the button is disabled, instead of leaving it mute', () => {
    expect(addLineBlockers({ ...fine, lineErrors: { ...fine.lineErrors, quantity: true } })).toEqual([
      'la cantidad tiene que ser un número entero de 1 a 100,000',
    ]);
    expect(addLineBlockers({ ...fine, priceInvalid: true })).toEqual(['corrige el descuento o el recargo']);
    expect(addLineBlockers({ ...fine, plates: 0, calculated: false })).toEqual(['agrega al menos una placa']);
    expect(addLineBlockers({ ...fine, missingSkus: 2 })).toEqual(['asocia cada filamento a uno del inventario']);
  });
});

describe('losingLines', () => {
  it('names the lines sold below their cost, made to order too (T4-14)', () => {
    const lines = [
      { draft: { description: 'Llavero' }, price: { marginAmount: -1.38 } },
      { draft: { description: 'Calavera' }, price: { marginAmount: 4 } },
    ];
    expect(losingLines(lines)).toEqual([{ description: 'Llavero', lossPerUnit: 1.38 }]);
  });
});

describe('validUntilFor', () => {
  it('counts calendar days from the workshop day', () => {
    expect(validUntilFor(15, '2026-10-08')).toBe('2026-10-23');
    expect(validUntilFor(30, '2026-12-15')).toBe('2027-01-14');
  });

  it('has no end for zero, and never for a negative number', () => {
    expect(validUntilFor(0, '2026-10-08')).toBeNull();
    expect(validUntilFor(-5, '2026-10-08')).toBeNull();
  });
});
