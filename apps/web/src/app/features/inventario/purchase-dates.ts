import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * How far back a purchase or its payment can be dated. Older than this it is
 * almost surely a typo in the year: 01/01/1900 went through without a word
 * (T1-24). The workshop opened in 2026; two years leave room for what was
 * bought before.
 */
const YEARS_BACK = 2;

/** The oldest day a purchase can carry, given today as YYYY-MM-DD. */
export function purchaseDateFloor(today: string): string {
  const [year, month, day] = today.split('-').map(Number);
  const floor = new Date(Date.UTC((year ?? 0) - YEARS_BACK, (month ?? 1) - 1, day ?? 1));
  return floor.toISOString().slice(0, 10);
}

/** A date (YYYY-MM-DD) or a datetime-local value before `floor` is refused as `tooOld`. */
export function notBefore(floor: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    typeof control.value === 'string' && control.value !== '' && control.value.slice(0, 10) < floor
      ? { tooOld: true }
      : null;
}
