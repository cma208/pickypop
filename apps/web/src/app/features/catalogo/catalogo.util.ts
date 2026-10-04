import { FormArray, FormControl, FormGroup, Validators, type ValidatorFn } from '@angular/forms';
import type { Pair } from './catalogo.models';

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Botella de poción" becomes "botella-de-pocion". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseTags(text: string): string[] {
  const tags = text
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

/** Empty or blank text is stored as null, not as an empty string. */
export function blankToNull(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------- name/value pairs

export type PairGroup = FormGroup<{
  name: FormControl<string>;
  value: FormControl<string>;
}>;

export function pairGroup(pair: Pair = { name: '', value: '' }): PairGroup {
  return new FormGroup({
    name: new FormControl(pair.name, { nonNullable: true, validators: [Validators.required] }),
    value: new FormControl(pair.value, { nonNullable: true }),
  });
}

const duplicateNames: ValidatorFn = (control) => {
  const names = (control as FormArray<PairGroup>).controls
    .map((group) => group.controls.name.value.trim().toLowerCase())
    .filter((name) => name !== '');
  return new Set(names).size === names.length ? null : { duplicateNames: true };
};

export function pairArray(pairs: Pair[]): FormArray<PairGroup> {
  return new FormArray(pairs.map((pair) => pairGroup(pair)), { validators: [duplicateNames] });
}

export function readPairs(array: FormArray<PairGroup>): Pair[] {
  return array.controls
    .map((group) => ({
      name: group.controls.name.value.trim(),
      value: group.controls.value.value.trim(),
    }))
    .filter((pair) => pair.name !== '');
}

// ------------------------------------------------------------------- errors

/** An error whose message is already written for the person using the app. */
export class CatalogoError extends Error {}

/** Message to show for anything thrown by the data layer. */
export function messageOf(error: unknown, fallback = 'Algo salió mal. Inténtalo otra vez.'): string {
  if (error instanceof CatalogoError) return error.message;
  console.error(error);
  return fallback;
}

/** Today as YYYY-MM-DD in the browser's own time zone. */
export function todayIso(): string {
  return new Date().toLocaleDateString('en-CA');
}
