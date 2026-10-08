import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { inputToIso, todayLocal } from './dates';

/**
 * Returns the message for the first error of a control, but only once the
 * person has touched it, so a fresh form is not covered in red.
 */
export function errorOf(
  control: AbstractControl | null,
  messages: Record<string, string>,
): string | null {
  if (!control || !control.errors || !(control.touched || control.dirty)) return null;

  const [key] = Object.keys(control.errors);
  return key ? (messages[key] ?? null) : null;
}

/** Empty strings become null, so optional text columns stay clean. */
export function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The validators every form shares: one rule, one error key, one shape, so a
 * message never reads a key another copy names differently (compras said
 * `{ decimals: { max } }` where this says `{ decimals: n }`, and mixing them
 * printed «Hasta undefined decimales»).
 *
 * | Validator      | Error key                         |
 * |----------------|-----------------------------------|
 * | `requiredText` | `required`                        |
 * | `wholeNumber`  | `integer`                         |
 * | `maxDecimals`  | `decimals`, the number allowed    |
 * | `notInFuture`  | `future`                          |
 */

/**
 * Like Validators.required, but a text of only spaces is empty too: the
 * database refuses a blank name, and the error would come back without
 * pointing at the field. It reports `required`, so the messages a form
 * already has for that key keep working.
 */
export function requiredText(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined) return { required: true };
  return typeof value === 'string' && value.trim() === '' ? { required: true } : null;
}

/** Pieces, minutes and days are counted whole. Empty is left to `required`. */
export function wholeNumber(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '') return null;
  return Number.isInteger(Number(value)) ? null : { integer: true };
}

/**
 * How many decimals a typed number has. Read from its shortest written form,
 * so 0.015005 has six and not the float's seventeen, 9,999,999,999.99 has two
 * (multiplied by 100 it is not a whole float), and «1e-7» has seven.
 */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const [mantissa = '', exponent = '0'] = String(value).toLowerCase().split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent));
}

/**
 * Floating point noise lives past the fifteenth significant digit: a rate of
 * 0.07 shown as a percentage is 7.000000000000001, and is still a whole 7.
 * Read to fifteen digits it is what was meant; anything a person types fits.
 */
const SIGNIFICANT_DIGITS = 15;

/**
 * No more decimals than the column keeps. The database rounds the rest
 * without a word: 15.00499999 became 15.00 and nobody was told (T1-18).
 * The error carries the number allowed: `{ decimals: 2 }`.
 */
export function maxDecimals(decimals: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const meant = Number(numeric.toPrecision(SIGNIFICANT_DIGITS));
    return decimalPlaces(meant) > decimals ? { decimals } : null;
  };
}

/** "2026-10-08" is ten characters; a datetime-local value is longer. */
const DATE_ONLY_LENGTH = 10;
/**
 * How far ahead of now something may be dated: the phone's clock is not the
 * server's. The database gives the same slack (`app.guard_ledger_entry`).
 */
const CLOCK_SLACK_MS = 5 * 60_000;

/** Whether an instant has not come yet, give or take the clocks' difference. */
export function isInTheFuture(iso: string, now = Date.now()): boolean {
  return Date.parse(iso) > now + CLOCK_SLACK_MS;
}

/**
 * What is being recorded already happened: a date ("2026-10-08") may not be
 * after the workshop's today, a datetime-local ("2026-10-08T14:30") not after
 * this moment in Lima, give or take the minutes the database allows. Money
 * paid tomorrow has not been paid: it lowered today's balance and opened a
 * month that had not come (T1-09, T4-06).
 */
export function notInFuture(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (typeof value !== 'string' || value === '') return null;
  if (value.length <= DATE_ONLY_LENGTH) return value > todayLocal() ? { future: true } : null;

  let iso: string;
  try {
    iso = inputToIso(value);
  } catch {
    // Half-typed: `required` and the browser speak for it.
    return null;
  }
  return isInTheFuture(iso) ? { future: true } : null;
}

/** At least one of the two numeric controls must hold a value. */
export function atLeastOneOf(first: string, second: string, key: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(first)?.value as number | null;
    const b = group.get(second)?.value as number | null;
    return a === null && b === null ? { [key]: true } : null;
  };
}
