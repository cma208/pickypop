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

// The label of a new roll («PETG-NEGRO-03») is given by the database when the
// purchase is registered: `app.spool_code_prefix` and `register_purchase`.
