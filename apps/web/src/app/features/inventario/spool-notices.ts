import { grams, money } from '../../core/format';
import { totalFor } from '../../core/pricing';
import type { SpoolStatusChange, WeighingResult } from './inventario.data';
import { SPOOL_STATUS_LABELS, signedQuantity, type SpoolStatus } from './inventario.format';

const NO_CODE = 'sin código';
/** Below this two weights are the same: the database keeps grams to three decimals. */
const GRAM_TOLERANCE = 0.0005;

/**
 * What a weighing did, said from what the database answered and not from what
 * the dialog expected: a weighing that changed nothing must not read as «ajuste
 * registrado», and one saved over an old dialog says what it adjusted from.
 */
export function weighingNotice(
  spool: { code: string | null; status: SpoolStatus; remainingG: number },
  result: WeighingResult,
): string {
  const code = spool.code ?? NO_CODE;
  if (Math.abs(result.differenceG) < GRAM_TOLERANCE) {
    return `El rollo ${code} ya tenía ${grams(result.afterG)} según sus movimientos: no hizo falta ningún ajuste.`;
  }

  const parts = [
    `Pesaje registrado: ajuste de ${signedQuantity(result.differenceG, 'g')} en el kardex, y el rollo ${code} quedó en ${grams(result.afterG)}.`,
  ];
  if (Math.abs(result.beforeG - spool.remainingG) >= GRAM_TOLERANCE) {
    parts.push(
      `Mientras pesabas, el rollo pasó de ${grams(spool.remainingG)} a ${grams(result.beforeG)}: el ajuste se calculó con lo último.`,
    );
  }
  if ((spool.status === 'empty' || spool.status === 'discarded') && result.status === 'open') {
    parts.push('La balanza encontró filamento, así que vuelve a estar abierto.');
  }
  return parts.join(' ');
}

/** What a change of state did. A roll emptied or discarded with grams on it says where they went. */
export function statusNotice(code: string | null, change: SpoolStatusChange): string {
  const label = SPOOL_STATUS_LABELS[change.status].toLowerCase();
  if (change.removedG <= 0) return `El rollo ${code ?? NO_CODE} ahora está: ${label}.`;

  const as = change.status === 'discarded' ? 'como merma' : 'como ajuste';
  return `El rollo ${code ?? NO_CODE} ahora está: ${label}. Salieron del stock ${grams(change.removedG)} (${money(change.removedCost)}) ${as}, y ya no cuentan para el plan.`;
}

/**
 * Before marking a roll empty or discarded: what it still holds and what will
 * happen to it. Null when it holds nothing and there is nothing to warn about.
 */
export function statusWarning(spool: { code: string | null; remainingG: number; costPerGram: number }, status: SpoolStatus): string | null {
  if (status !== 'empty' && status !== 'discarded') return null;
  if (spool.remainingG <= 0) return null;

  const held = `${grams(spool.remainingG)} (${money(totalFor(spool.costPerGram, spool.remainingG))})`;
  return status === 'discarded'
    ? `Según sus movimientos, al rollo ${spool.code ?? NO_CODE} le quedan ${held}. Al descartarlo salen del stock como merma y dejan de contar para el plan.`
    : `Según sus movimientos, al rollo ${spool.code ?? NO_CODE} le quedan ${held}. Al marcarlo agotado salen del stock como ajuste y dejan de contar para el plan.`;
}

/** A roll with no grams that is empty or discarded goes back to use by weighing it, not by picking a state. */
export function needsWeighingToReturn(spool: { status: SpoolStatus; remainingG: number }, status: SpoolStatus): boolean {
  const usable = status === 'sealed' || status === 'open' || status === 'in_use';
  const out = spool.status === 'empty' || spool.status === 'discarded';
  return usable && out && spool.remainingG <= 0;
}
