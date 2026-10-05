import type { AbstractControl } from '@angular/forms';

/** A short Spanish message for the first problem of a touched, invalid control. */
export function invalidMessage(control: AbstractControl): string | null {
  if (!control.touched || control.valid) return null;

  const errors = control.errors ?? {};
  if (errors['required']) return 'Este campo es obligatorio.';
  if (errors['min']) return `El valor mínimo es ${(errors['min'] as { min: number }).min}.`;
  if (errors['pattern']) return 'El formato no es válido.';
  if (errors['future']) return 'La fecha no puede ser futura.';
  if (errors['maxlength']) return 'El texto es demasiado largo.';
  return 'Revisa este dato.';
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
