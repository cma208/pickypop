import { FormControl, Validators } from '@angular/forms';
import { maxDecimals } from '../../core/form-errors';
import { GRAM_DECIMALS, toHundredths } from './job-grams';
import { createOutputControl } from './print-job-outputs';

describe('grams to the hundredth (T3-18)', () => {
  it('rounds like the job keeps them', () => {
    expect(toHundredths(50.126)).toBe(50.13);
    expect(toHundredths(14.3865)).toBe(14.39);
  });

  it('takes two decimals and refuses three, with the key every form reads', () => {
    const grams = (value: number | null) => new FormControl(value, [Validators.min(0), maxDecimals(GRAM_DECIMALS)]);
    expect(grams(null).errors).toBeNull();
    expect(grams(8.63).errors).toBeNull();
    expect(grams(0.1 + 0.2).errors).toBeNull();
    expect(grams(50.126).errors).toEqual({ decimals: 2 });
  });
});

describe('whole pieces (T3-04)', () => {
  it('refuses 6.5 caps and takes 6, with the key every form reads', () => {
    expect(createOutputControl(7).errors).toBeNull();
    const control = createOutputControl(7);
    control.setValue(6.5);
    expect(control.errors).toEqual({ integer: true });
    control.setValue(6);
    expect(control.errors).toBeNull();
    control.setValue(0);
    expect(control.errors).toBeNull();
  });
});
