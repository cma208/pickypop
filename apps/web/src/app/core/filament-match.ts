/**
 * Which spool in stock a sliced filament most likely came from.
 *
 * Lived inside the quoting screen, where it was written. It is needed in the
 * recipe too —the same file, read for the same reason— and a second copy of a
 * guess is how two screens start disagreeing about the same filament.
 */

/** What a sliced plate says about one of its filaments. */
export interface SlicedFilamentHint {
  colorHex: string | null;
  /** Bambu profile id, e.g. GFA00 (PLA Basic). */
  trayInfoIdx: string | null;
}

/** What the workshop has, as far as matching is concerned. */
export interface FilamentCandidate {
  id: string;
  colorHex: string | null;
  trayInfoIdx: string | null;
}

/** Beyond this the colours are simply different, so we rather suggest nothing. */
const NEAR_COLOR_THRESHOLD = 40;

function parseHex(hex: string | null): [number, number, number] | null {
  if (hex === null) return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const value = Number.parseInt(match[1] as string, 16);

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Plain RGB distance. Good enough to tell "the same red" from "another red". */
function colorDistance(a: string | null, b: string | null): number | null {
  const left = parseHex(a);
  const right = parseHex(b);
  if (left === null || right === null) return null;

  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

/**
 * Proposes the stock SKU a sliced filament most likely came from, crossing the
 * Bambu profile id with the colour, as docs/01-investigacion.md 1.2 suggests.
 * Returns null when nothing is close enough: a wrong guess costs more than a
 * blank the user has to fill.
 */
export function suggestFilamentSku(
  filament: SlicedFilamentHint,
  options: readonly FilamentCandidate[],
): string | null {
  let best: { id: string; score: number } | null = null;

  for (const option of options) {
    let score = 0;

    const sameTray =
      filament.trayInfoIdx !== null &&
      option.trayInfoIdx !== null &&
      filament.trayInfoIdx.toLowerCase() === option.trayInfoIdx.toLowerCase();
    if (sameTray) score += 100;

    const distance = colorDistance(filament.colorHex, option.colorHex);
    if (distance !== null && distance <= NEAR_COLOR_THRESHOLD) {
      score += 100 - distance;
    }

    if (score > 0 && (best === null || score > best.score)) best = { id: option.id, score };
  }

  return best === null ? null : best.id;
}
