import type { AbstractControl, ValidationErrors } from '@angular/forms';

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

/** At least one of the two numeric controls must hold a value. */
export function atLeastOneOf(first: string, second: string, key: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(first)?.value as number | null;
    const b = group.get(second)?.value as number | null;
    return a === null && b === null ? { [key]: true } : null;
  };
}
