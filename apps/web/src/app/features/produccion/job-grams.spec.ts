import { FormControl } from '@angular/forms';
import { hasAtMostHundredths, hundredths, toHundredths, wholeNumber } from './job-grams';

describe('grams to the hundredth (T3-18)', () => {
  it('takes two decimals and refuses three', () => {
    expect(hasAtMostHundredths(50.13)).toBe(true);
    expect(hasAtMostHundredths(0.1 + 0.2)).toBe(true);
    expect(hasAtMostHundredths(50.126)).toBe(false);
  });

  it('rounds like the job keeps them', () => {
    expect(toHundredths(50.126)).toBe(50.13);
    expect(toHundredths(14.3865)).toBe(14.39);
  });

  it('validates a field, leaving an empty one to `required`', () => {
    expect(hundredths(new FormControl(null))).toBeNull();
    expect(hundredths(new FormControl(8.63))).toBeNull();
    expect(hundredths(new FormControl(8.634))).toEqual({ hundredths: true });
  });
});

describe('whole pieces (T3-04)', () => {
  it('refuses 6.5 caps and takes 6', () => {
    expect(wholeNumber(new FormControl(6.5))).toEqual({ wholeNumber: true });
    expect(wholeNumber(new FormControl(6))).toBeNull();
    expect(wholeNumber(new FormControl(0))).toBeNull();
    expect(wholeNumber(new FormControl(null))).toBeNull();
  });
});
