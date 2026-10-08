import { FormControl } from '@angular/forms';
import {
  blankToNull,
  decimalPlaces,
  inactiveSuffix,
  invalidMessage,
  maxDecimals,
  photosToDelete,
  requiredText,
  selectableOptions,
} from './form-helpers';

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

describe('decimalPlaces', () => {
  it('counts the decimals as typed, not the float ones', () => {
    expect(decimalPlaces(0.015005)).toBe(6);
    expect(decimalPlaces(0.01500499)).toBe(8);
    expect(decimalPlaces(53.3)).toBe(1);
    expect(decimalPlaces(1000)).toBe(0);
    expect(decimalPlaces(1e-7)).toBe(7);
  });
});

describe('maxDecimals', () => {
  it('refuses more decimals than the column keeps, with its own message', () => {
    const control = new FormControl(10.005, maxDecimals(2));
    control.markAsTouched();
    expect(control.errors).toEqual({ decimals: 2 });
    expect(invalidMessage(control)).toBe('Hasta 2 decimales.');
  });

  it('reads the limit in either shape, so core/form-errors and this file can be mixed', () => {
    const withShape = (decimals: unknown) => {
      const control = new FormControl(1.5);
      control.setErrors({ decimals });
      control.markAsTouched();
      return invalidMessage(control);
    };
    expect(withShape(0)).toBe('Va entero, sin decimales.');
    expect(withShape(3)).toBe('Hasta 3 decimales.');
    expect(withShape({ max: 2 })).toBe('Hasta 2 decimales.');
  });

  it('leaves an empty field to «required»', () => {
    expect(maxDecimals(2)(new FormControl(null))).toBeNull();
  });
});
