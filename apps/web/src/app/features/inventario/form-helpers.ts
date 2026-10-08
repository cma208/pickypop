import type { AbstractControl } from '@angular/forms';

const NUMBER = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 6 });

/**
 * A short Spanish message for the first problem of a touched, invalid
 * control. It reads the keys of the shared validators (core/form-errors.ts):
 * `required`, `integer`, `decimals` with the number allowed, `future`.
 */
export function invalidMessage(control: AbstractControl): string | null {
  if (!control.touched || control.valid) return null;

  const errors = control.errors ?? {};
  if (errors['required']) return 'Este campo es obligatorio.';
  if (errors['min']) return `El valor mínimo es ${NUMBER.format((errors['min'] as { min: number }).min)}.`;
  if (errors['max']) return `Hasta ${NUMBER.format((errors['max'] as { max: number }).max)}: revisa el número.`;
  if (errors['integer']) return decimalsMessage(0);
  if (typeof errors['decimals'] === 'number') return decimalsMessage(errors['decimals']);
  if (errors['pattern']) return 'El formato no es válido.';
  if (errors['future']) return 'La fecha no puede ser futura.';
  if (errors['tooOld']) return 'La fecha es de hace más de dos años: revisa el año.';
  if (errors['maxlength']) return 'El texto es demasiado largo.';
  return 'Revisa este dato.';
}

function decimalsMessage(max: number): string {
  if (max === 0) return 'Va entero, sin decimales.';
  return max === 1 ? 'Hasta 1 decimal.' : `Hasta ${max} decimales.`;
}

/** Trims a text control into `null` when it is blank, so empty inputs do not become '' in the database. */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The entries a select should offer: the active ones, plus `currentId` even if
 * it was deactivated since. Deactivating hides a brand from new filaments, but
 * a filament that already uses it must still show (and keep) it when edited;
 * otherwise the select would render blank and saving would silently drop it.
 */
export function selectableOptions<T extends { id: string; active: boolean }>(
  options: readonly T[],
  currentId: string | null,
): T[] {
  return options.filter((option) => option.active || option.id === currentId);
}

/** Marks a deactivated entry in a select, so it is clear why it is the only one of its kind listed. */
export function inactiveSuffix(option: { active: boolean }): string {
  return option.active ? '' : ' (ya no se ofrece)';
}

/**
 * The pictures a form with a photo field can delete when it closes.
 *
 * Until Save, the article still points at its `original` picture, so a cancel
 * deletes only what was uploaded meanwhile. After Save only `kept` is in use:
 * the original (if it was replaced) and every discarded try go.
 */
export function photosToDelete(
  uploaded: Iterable<string>,
  original: string | null,
  kept: string | null,
  saved: boolean,
): string[] {
  const candidates = saved ? [...uploaded, original] : [...uploaded];
  const inUse = saved ? kept : original;
  return [...new Set(candidates)].filter((path): path is string => !!path && path !== inUse);
}
