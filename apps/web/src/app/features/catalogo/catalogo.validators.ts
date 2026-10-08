import type { AbstractControl } from '@angular/forms';

/**
 * How far each number of the catalogue may go. The columns hold much more,
 * but a value past these is a typo, and the database answered it with «No
 * pudimos guardar» and no word about which field was wrong (T2-16).
 */
export const LIMITS = {
  /** Soles per unit: list price and price tiers. */
  price: 100_000,
  /** Units: a tier's minimum, the minimum order. */
  units: 100_000,
  leadTimeDays: 365,
  /** Preparation per batch and minutes per unit of a recipe. */
  recipeMinutes: 10_000,
  /** A week of printing for one plate. */
  plateMinutes: 10_080,
  /** Products or parts out of one run of a plate. */
  perRun: 1_000,
  /** Grams of one slot in one run. */
  grams: 10_000,
  slot: 32,
  /** Of a supply or a part, per finished unit. */
  perUnit: 100_000,
} as const;

/**
 * Decimals each kind of number keeps in the database. More than that used to
 * be rounded without a word: 19.999 was saved as 20.00 (T2-17). The
 * validators themselves are the shared ones (core/form-errors.ts):
 * `requiredText`, `wholeNumber` (`integer`) and `maxDecimals` (`decimals`).
 */
export const DECIMALS = {
  money: 2,
  quantity: 3,
  grams: 2,
  minutes: 2,
} as const;

/** «hasta 2 decimales», with the number agreeing. */
export function decimalsText(decimals: number): string {
  return decimals === 1 ? 'hasta 1 decimal' : `hasta ${decimals} decimales`;
}

/** «100,000», as the workshop writes a big number. */
export function limitText(limit: number): string {
  return limit.toLocaleString('en-US');
}

/**
 * The message for the first error of a control, once it was touched or
 * edited. Unlike `errorOf`, an error with no message of its own still says
 * something: a field marked red with nothing next to it is the silent button
 * of T2-12.
 */
export function fieldError(
  control: AbstractControl,
  messages: Record<string, string>,
  fallback = 'Revisa este valor.',
): string | null {
  if (!control.errors || !(control.touched || control.dirty)) return null;
  const [key] = Object.keys(control.errors);
  return key ? (messages[key] ?? fallback) : null;
}
