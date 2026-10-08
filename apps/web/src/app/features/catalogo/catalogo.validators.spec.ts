import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { maxDecimals, requiredText, wholeNumber } from '../../core/form-errors';
import { decimalsText, fieldError } from './catalogo.validators';

/** The catalogue uses the shared validators; what it says depends on their keys. */
describe('the catalogue on the shared validators', () => {
  it('counts only spaces as nothing, as the database does (T2-19)', () => {
    expect(requiredText(new FormControl('    '))).toEqual({ required: true });
    expect(requiredText(new FormControl(''))).toEqual({ required: true });
    expect(requiredText(new FormControl(' Calavera '))).toBeNull();
  });

  it('lets whole numbers and empty fields through, and stops a fraction (T2-09, T2-16)', () => {
    expect(wholeNumber(new FormControl(7))).toBeNull();
    expect(wholeNumber(new FormControl(null))).toBeNull();
    expect(wholeNumber(new FormControl(1.5))).toEqual({ integer: true });
  });

  it('refuses more decimals than the column keeps, instead of rounding them away (T2-17)', () => {
    const money = maxDecimals(2);
    expect(money(new FormControl(19.99))).toBeNull();
    expect(money(new FormControl(19.999))).toEqual({ decimals: 2 });
    expect(maxDecimals(3)(new FormControl(66.125))).toBeNull();
  });
});

describe('fieldError', () => {
  it('says nothing on a field nobody touched', () => {
    const control = new FormControl<number | null>(null, wholeNumber);
    control.setValue(1.5);

    expect(fieldError(control, { integer: 'Entero.' })).toBeNull();
  });

  it('says the message of the first error once touched, and something even without one', () => {
    const control = new FormControl<number | null>(1.5, wholeNumber);
    control.markAsTouched();

    expect(fieldError(control, { integer: 'Entero.' })).toBe('Entero.');
    expect(fieldError(control, {})).toBe('Revisa este valor.');
  });

  it('reads the key the shared validator gives, so a fraction is never «Revisa este valor»', () => {
    const control = new FormControl<number | null>(2.5, wholeNumber);
    control.markAsTouched();

    expect(fieldError(control, { integer: 'Las piezas van enteras.' })).toBe('Las piezas van enteras.');
  });
});

describe('decimalsText', () => {
  it('agrees with the number', () => {
    expect(decimalsText(1)).toBe('hasta 1 decimal');
    expect(decimalsText(2)).toBe('hasta 2 decimales');
  });
});
