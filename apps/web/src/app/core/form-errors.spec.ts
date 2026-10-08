import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { isoToInput, nowForInput, todayLocal } from './dates';
import { decimalPlaces, maxDecimals, notInFuture, requiredText, wholeNumber } from './form-errors';

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

  it('gives a moment the same few minutes of slack the database gives a phone clock', () => {
    const inLima = (offsetMs: number) => isoToInput(new Date(Date.now() + offsetMs).toISOString());

    expect(notInFuture(new FormControl(inLima(2 * 60_000)))).toBeNull();
    expect(notInFuture(new FormControl(inLima(30 * 60_000)))).toEqual({ future: true });
  });

  it('leaves a half-typed value to required and the browser', () => {
    expect(notInFuture(new FormControl('2026-1'))).toBeNull();
    expect(notInFuture(new FormControl('2026-13-45T99:99'))).toBeNull();
  });
});

describe('maxDecimals', () => {
  it('says so instead of letting the database round in silence', () => {
    expect(maxDecimals(2)(new FormControl(15.00499999))).toEqual({ decimals: 2 });
    expect(maxDecimals(2)(new FormControl(-50.129))).toEqual({ decimals: 2 });
    expect(maxDecimals(6)(new FormControl(0.01500499))).toEqual({ decimals: 6 });
  });

  it('accepts what the column keeps, floating point noise included', () => {
    expect(maxDecimals(2)(new FormControl(0.07))).toBeNull();
    expect(maxDecimals(2)(new FormControl(15))).toBeNull();
    expect(maxDecimals(4)(new FormControl(0.7556))).toBeNull();
    expect(maxDecimals(2)(new FormControl(null))).toBeNull();
    expect(maxDecimals(2)(new FormControl(''))).toBeNull();
  });

  it('accepts the largest amount a column holds, which times 100 is not a whole float', () => {
    expect(maxDecimals(2)(new FormControl(9_999_999_999.99))).toBeNull();
    expect(maxDecimals(2)(new FormControl(19.99))).toBeNull();
  });

  it('is not fooled by the noise of arithmetic: a rate of 0.07 shown as 7 %', () => {
    expect(maxDecimals(2)(new FormControl(0.07 * 100))).toBeNull();
    expect(maxDecimals(2)(new FormControl(0.1 + 0.2))).toBeNull();
    expect(maxDecimals(2)(new FormControl(1998.99))).toBeNull();
    expect(maxDecimals(2)(new FormControl(13.505))).toEqual({ decimals: 2 });
    expect(maxDecimals(3)(new FormControl(50.0004))).toEqual({ decimals: 3 });
  });
});

describe('decimalPlaces', () => {
  it('counts the decimals as typed, not the float ones', () => {
    expect(decimalPlaces(0.015005)).toBe(6);
    expect(decimalPlaces(53.3)).toBe(1);
    expect(decimalPlaces(1000)).toBe(0);
    expect(decimalPlaces(1e-7)).toBe(7);
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
