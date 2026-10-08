import { FormControl } from '@angular/forms';
import { notBefore, purchaseDateFloor } from './purchase-dates';

describe('purchaseDateFloor', () => {
  it('is two years before today', () => {
    expect(purchaseDateFloor('2026-10-08')).toBe('2024-10-08');
  });
});

describe('notBefore', () => {
  const floor = notBefore('2024-10-08');

  it('refuses 01/01/1900 and lets a date inside the window through (T1-24)', () => {
    expect(floor(new FormControl('1900-01-01'))).toEqual({ tooOld: true });
    expect(floor(new FormControl('2025-03-01'))).toBeNull();
  });

  it('judges a datetime-local value by its day, and leaves an empty one to «required»', () => {
    expect(floor(new FormControl('1900-01-01T10:00'))).toEqual({ tooOld: true });
    expect(floor(new FormControl(''))).toBeNull();
  });
});
