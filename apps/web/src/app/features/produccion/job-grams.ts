import type { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Grams and pieces as the database keeps them.
 *
 * A job keeps its grams to the hundredth (numeric 10,2) and the kardex to the
 * thousandth: 50.126 g used to be 50.13 on the job and −50.126 on the roll
 * (T3-18). `complete_print_job` now rounds before it writes either, and the
 * forms ask for no more than it keeps, so what is typed is what both say.
 */

const HUNDREDTHS = 100;
/** Float noise allowed when checking that 12.34 × 100 is whole. */
const TOLERANCE = 1e-6;

/** Whether a number has at most two decimals. */
export function hasAtMostHundredths(value: number): boolean {
  return Math.abs(Math.round(value * HUNDREDTHS) - value * HUNDREDTHS) < TOLERANCE;
}

/** Rounded to the hundredth, the way the job keeps its grams. */
export function toHundredths(value: number): number {
  return Math.round(value * HUNDREDTHS) / HUNDREDTHS;
}

/** Validator: an empty field passes (`required` says if it must not be empty); 12.345 g does not. */
export function hundredths(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' && Number.isFinite(value) && hasAtMostHundredths(value) ? null : { hundredths: true };
}

/**
 * Validator: pieces come out whole. A number input in a reactive form takes
 * 6.5 as it is, and `step="1"` validates nothing: 6.5 caps went on the shelf
 * and «Contar el estante», which only takes whole numbers, could not be saved
 * until someone fixed that row (T3-04).
 */
export function wholeNumber(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' && Number.isInteger(value) ? null : { wholeNumber: true };
}
