import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { nowForInput, todayLocal } from './dates';
import { maxDecimals, notInFuture, requiredText, wholeNumber } from './form-errors';

describe('requiredText', () => {
  it('treats a name of only spaces as empty, like the database does', () => {
    expect(requiredText(new FormControl('   '))).toEqual({ required: true });
    expect(requiredText(new FormControl(''))).toEqual({ required: true });
    expect(requiredText(new FormControl(null))).toEqual({ required: true });
  });

  it('accepts a name with spaces around it: it is saved trimmed', () => {
    expect(requiredText(new FormControl('  Instagram '))).toBeNull();
  });
});

describe('notInFuture', () => {
  it('refuses a day after today and a moment after now, in Lima time', () => {
    expect(notInFuture(new FormControl('2999-01-01'))).toEqual({ future: true });
    expect(notInFuture(new FormControl('2999-01-01T10:00'))).toEqual({ future: true });
  });

  it('accepts today, now and the past, and leaves empty to required', () => {
    expect(notInFuture(new FormControl(todayLocal()))).toBeNull();
    expect(notInFuture(new FormControl(nowForInput()))).toBeNull();
    expect(notInFuture(new FormControl('2026-01-01T08:00'))).toBeNull();
    expect(notInFuture(new FormControl(''))).toBeNull();
  });
});

describe('maxDecimals', () => {
  it('says so instead of letting the database round in silence', () => {
    expect(maxDecimals(2)(new FormControl(15.00499999))).toEqual({ decimals: 2 });
    expect(maxDecimals(2)(new FormControl(-50.129))).toEqual({ decimals: 2 });
  });

  it('accepts what the column keeps, floating point noise included', () => {
    expect(maxDecimals(2)(new FormControl(0.07))).toBeNull();
    expect(maxDecimals(2)(new FormControl(15))).toBeNull();
    expect(maxDecimals(4)(new FormControl(0.7556))).toBeNull();
    expect(maxDecimals(2)(new FormControl(null))).toBeNull();
  });
});

describe('wholeNumber', () => {
  it('refuses decimals where things are counted', () => {
    expect(wholeNumber(new FormControl(1.5))).toEqual({ integer: true });
  });

  it('accepts whole numbers, zero included, and leaves empty to required', () => {
    expect(wholeNumber(new FormControl(15))).toBeNull();
    expect(wholeNumber(new FormControl(0))).toBeNull();
    expect(wholeNumber(new FormControl(null))).toBeNull();
  });
});
