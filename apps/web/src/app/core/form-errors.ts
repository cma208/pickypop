import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { nowForInput, todayLocal } from './dates';

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

/** "2026-10-08" is ten characters; a datetime-local value is longer. */
const DATE_ONLY_LENGTH = 10;

/**
 * What is being recorded already happened: a date ("2026-10-08") may not be
 * after the workshop's today, a datetime-local ("2026-10-08T14:30") not after
 * this minute in Lima. Both formats compare as text.
 */
export function notInFuture(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (typeof value !== 'string' || value === '') return null;
  const limit = value.length <= DATE_ONLY_LENGTH ? todayLocal() : nowForInput();
  return value > limit ? { future: true } : null;
}

/** At least one of the two numeric controls must hold a value. */
export function atLeastOneOf(first: string, second: string, key: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(first)?.value as number | null;
    const b = group.get(second)?.value as number | null;
    return a === null && b === null ? { [key]: true } : null;
  };
}
