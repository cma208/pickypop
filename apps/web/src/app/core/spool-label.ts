import { grams } from './format';

/**
 * What a person needs to tell two rolls apart. The code alone cannot do it:
 * «NEGRO-02» was a PETG roll that looked like the second black PLA, and a
 * wrong roll on the printer means the wrong material and a wrong discount
 * (barrido, recorrido desde cero, H12).
 */
export interface SpoolIdentity {
  code: string | null;
  /** «PLA», «PETG»… Null or empty when the filament has none. */
  materialCode?: string | null;
  colorName?: string | null;
}

const NO_CODE = 'Sin código';
const SEPARATOR = ' · ';
const CODE_MATERIAL_MAX = 8;
const CODE_COLOR_MAX = 6;
const FALLBACK_PREFIX = 'ROLLO';

/** «PETG Negro». The material comes before the colour: it is what the colour alone hides. */
export function filamentName(materialCode: string | null | undefined, colorName: string | null | undefined): string {
  return [materialCode, colorName].map((part) => part?.trim()).filter(Boolean).join(' ');
}

/** «NEGRO-02 · PETG Negro». */
export function spoolName(spool: SpoolIdentity): string {
  return [spool.code?.trim() || NO_CODE, filamentName(spool.materialCode, spool.colorName)]
    .filter(Boolean)
    .join(SEPARATOR);
}

/** «NEGRO-02 · PETG Negro · 904 g»: for every list where a roll is chosen. */
export function spoolLabel(spool: SpoolIdentity, remainingG?: number | null): string {
  const name = spoolName(spool);
  return remainingG === null || remainingG === undefined ? name : name + SEPARATOR + grams(remainingG);
}

function alphanumeric(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * The shelf label of a new roll without its number: «PETG-NEGRO». The
 * material is part of it so a PETG black and a PLA black never share a
 * sequence. A «+» becomes PLUS, or PLA+ would be indistinguishable from PLA.
 * Rolls that already exist keep the label that is stuck on them.
 */
export function spoolCodePrefix(materialCode: string | null | undefined, colorName: string | null | undefined): string {
  const material = alphanumeric((materialCode ?? '').replace(/\+/g, 'PLUS')).slice(0, CODE_MATERIAL_MAX);
  const color = alphanumeric(colorName).slice(0, CODE_COLOR_MAX) || FALLBACK_PREFIX;
  return material ? `${material}-${color}` : color;
}
