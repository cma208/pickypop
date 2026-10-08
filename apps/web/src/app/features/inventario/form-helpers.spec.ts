import { FormControl, type ValidatorFn } from '@angular/forms';
import { maxDecimals, notInFuture, requiredText, wholeNumber } from '../../core/form-errors';
import { blankToNull, inactiveSuffix, invalidMessage, photosToDelete, selectableOptions } from './form-helpers';

describe('photosToDelete', () => {
  it('on cancel deletes only what was uploaded, never the photo the article still has', () => {
    expect(photosToDelete(['new-1.webp', 'new-2.webp'], 'old.webp', 'new-2.webp', false)).toEqual([
      'new-1.webp',
      'new-2.webp',
    ]);
  });

  it('on save keeps the chosen photo and deletes the replaced one and the discarded tries', () => {
    expect(photosToDelete(['new-1.webp', 'new-2.webp'], 'old.webp', 'new-2.webp', true)).toEqual([
      'new-1.webp',
      'old.webp',
    ]);
  });

  it('on save after removing the photo deletes the old one', () => {
    expect(photosToDelete([], 'old.webp', null, true)).toEqual(['old.webp']);
  });

  it('has nothing to delete when nothing changed', () => {
    expect(photosToDelete([], 'old.webp', 'old.webp', true)).toEqual([]);
    expect(photosToDelete([], null, null, false)).toEqual([]);
  });
});

describe('selectableOptions', () => {
  const options = [
    { id: 'a', active: true },
    { id: 'b', active: false },
    { id: 'c', active: true },
  ];

  it('offers only the active entries when creating', () => {
    expect(selectableOptions(options, null).map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('keeps the deactivated entry the record being edited already uses', () => {
    expect(selectableOptions(options, 'b').map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not bring back other deactivated entries', () => {
    expect(selectableOptions(options, 'a').map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('copes with a current id that is not in the list', () => {
    expect(selectableOptions(options, 'zzz').map((o) => o.id)).toEqual(['a', 'c']);
  });
});

describe('inactiveSuffix', () => {
  it('only marks the deactivated ones', () => {
    expect(inactiveSuffix({ active: true })).toBe('');
    expect(inactiveSuffix({ active: false })).toBe(' (ya no se ofrece)');
  });
});

describe('blankToNull', () => {
  it('turns blank text into null and trims the rest', () => {
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull(' Seda ')).toBe('Seda');
  });
});

describe('requiredText', () => {
  it('takes three spaces for the empty field they are (T1-12)', () => {
    expect(requiredText(new FormControl('   '))).toEqual({ required: true });
    expect(requiredText(new FormControl(''))).toEqual({ required: true });
    expect(requiredText(new FormControl(null))).toEqual({ required: true });
    expect(requiredText(new FormControl(' Blanco '))).toBeNull();
  });

  it('reads like an empty field', () => {
    const control = new FormControl('   ', requiredText);
    control.markAsTouched();
    expect(invalidMessage(control)).toBe('Este campo es obligatorio.');
  });
});

describe('invalidMessage, on the shared validators', () => {
  const touched = (value: unknown, validator: ValidatorFn) => {
    const control = new FormControl(value, validator);
    control.markAsTouched();
    return invalidMessage(control);
  };

  it('says how many decimals the column keeps, read from core\'s { decimals: n }', () => {
    expect(touched(10.005, maxDecimals(2))).toBe('Hasta 2 decimales.');
    expect(touched(1.0005, maxDecimals(1))).toBe('Hasta 1 decimal.');
    expect(touched(1.5, maxDecimals(0))).toBe('Va entero, sin decimales.');
  });

  it('never prints «Hasta undefined decimales»', () => {
    for (const decimals of [0, 1, 2, 3, 4, 6]) {
      expect(touched(1.1234567, maxDecimals(decimals))).not.toContain('undefined');
    }
  });

  it('says a whole quantity has no decimals', () => {
    expect(touched(2.5, wholeNumber)).toBe('Va entero, sin decimales.');
  });

  it('says a date in the future cannot be', () => {
    expect(touched('2999-01-01', notInFuture)).toBe('La fecha no puede ser futura.');
    expect(touched('2999-01-01T10:00', notInFuture)).toBe('La fecha no puede ser futura.');
  });
});
