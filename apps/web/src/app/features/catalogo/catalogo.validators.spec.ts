import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { decimalsText, fieldError, maxDecimals, requiredText, wholeNumber } from './catalogo.validators';

describe('requiredText', () => {
  it('counts only spaces as nothing, as the database does (T2-19)', () => {
    expect(requiredText(new FormControl('    '))).toEqual({ required: true });
    expect(requiredText(new FormControl(''))).toEqual({ required: true });
    expect(requiredText(new FormControl(' Calavera '))).toBeNull();
  });
});

describe('wholeNumber', () => {
  it('lets whole numbers and empty fields through, and stops a fraction (T2-09, T2-16)', () => {
    expect(wholeNumber(new FormControl(7))).toBeNull();
    expect(wholeNumber(new FormControl(null))).toBeNull();
    expect(wholeNumber(new FormControl(1.5))).toEqual({ whole: true });
    expect(wholeNumber(new FormControl(2.5))).toEqual({ whole: true });
  });
});

describe('maxDecimals', () => {
  it('refuses more decimals than the column keeps, instead of rounding them away (T2-17)', () => {
    const money = maxDecimals(2);
    expect(money(new FormControl(19.99))).toBeNull();
    expect(money(new FormControl(19.999))).toEqual({ decimals: { max: 2 } });
    expect(money(new FormControl(13.505))).toEqual({ decimals: { max: 2 } });
    expect(maxDecimals(3)(new FormControl(50.0004))).toEqual({ decimals: { max: 3 } });
    expect(maxDecimals(3)(new FormControl(66.125))).toBeNull();
  });

  it('is not fooled by floating point: 19.99 is two decimals', () => {
    expect(maxDecimals(2)(new FormControl(0.1 + 0.2))).toBeNull();
    expect(maxDecimals(2)(new FormControl(1998.99))).toBeNull();
  });
});

describe('fieldError', () => {
  it('says nothing on a field nobody touched', () => {
    const control = new FormControl<number | null>(null, wholeNumber);
    control.setValue(1.5);

    expect(fieldError(control, { whole: 'Entero.' })).toBeNull();
  });

  it('says the message of the first error once touched, and something even without one', () => {
    const control = new FormControl<number | null>(1.5, wholeNumber);
    control.markAsTouched();

    expect(fieldError(control, { whole: 'Entero.' })).toBe('Entero.');
    expect(fieldError(control, {})).toBe('Revisa este valor.');
  });
});

describe('decimalsText', () => {
  it('agrees with the number', () => {
    expect(decimalsText(1)).toBe('hasta 1 decimal');
    expect(decimalsText(2)).toBe('hasta 2 decimales');
  });
});
