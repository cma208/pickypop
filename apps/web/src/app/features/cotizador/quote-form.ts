import type { PriceBreakdown } from '../../core/pricing';

/**
 * The quote calculator's form rules, apart from the screen so they can be
 * tested: what each field accepts, what it says when it does not, and why
 * a line cannot be added yet.
 */

/** Whole units: a quote of 2.5 units was saved as 3 without a word (T4-13). */
export const WHOLE_NUMBER = /^\d+$/;

export const MAX_QUOTE_UNITS = 100_000;
/** Ten thousand minutes of setup or of work per unit is already a typo. */
export const MAX_MINUTES = 10_000;
export const MAX_DISCOUNT_PERCENT = 90;
export const MAX_SURCHARGE_PERCENT = 100;
export const DEFAULT_VALIDITY_DAYS = 15;
export const MAX_VALIDITY_DAYS = 365;

/**
 * Kept inside its range for the arithmetic, so a 1010 % typed by accident
 * never reaches a breakdown. It is no longer silent: the field says it is out
 * of range and the line cannot be added until it is fixed (T4-14).
 */
export function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), max);
}

const UNITS_TEXT = new Intl.NumberFormat('es-PE').format(MAX_QUOTE_UNITS);
const MINUTES_TEXT = new Intl.NumberFormat('es-PE').format(MAX_MINUTES);

/** What each field says for each problem, in the words shown under it. */
export const QUOTE_FIELD_ERRORS: Record<string, Record<string, string>> = {
  description: {
    required: 'Escribe qué se cotiza.',
    pattern: 'Escribe qué se cotiza: solo espacios no cuenta.',
    maxlength: 'La descripción es demasiado larga: hasta 180 letras.',
  },
  quantity: {
    required: 'Escribe cuántas unidades.',
    min: 'La cantidad tiene que ser de 1 unidad o más.',
    max: `La cantidad no puede pasar de ${UNITS_TEXT} unidades.`,
    pattern: 'Escribe un número entero de unidades: no se cotizan fracciones.',
  },
  setupMinutes: {
    required: 'Escribe los minutos, o 0.',
    min: 'Los minutos no pueden ser negativos.',
    max: `No puede pasar de ${MINUTES_TEXT} minutos.`,
  },
  minutesPerUnit: {
    required: 'Escribe los minutos, o 0.',
    min: 'Los minutos no pueden ser negativos.',
    max: `No puede pasar de ${MINUTES_TEXT} minutos.`,
  },
  volumeDiscountPercent: {
    required: 'Escribe el descuento, o 0.',
    min: `El descuento va de 0 % a ${MAX_DISCOUNT_PERCENT} %.`,
    max: `El descuento va de 0 % a ${MAX_DISCOUNT_PERCENT} %: más que eso regala el trabajo.`,
  },
  urgencySurchargePercent: {
    required: 'Escribe el recargo, o 0.',
    min: `El recargo va de 0 % a ${MAX_SURCHARGE_PERCENT} %.`,
    max: `El recargo va de 0 % a ${MAX_SURCHARGE_PERCENT} %.`,
  },
  customerId: {
    required: 'Elige el cliente: una cotización siempre lleva un nombre. Si es nuevo, créalo con «+ Nuevo cliente».',
  },
  validityDays: {
    required: 'Escribe cuántos días vale, o 0 para que no venza.',
    min: `La vigencia va de 0 a ${MAX_VALIDITY_DAYS} días (0: no vence).`,
    max: `La vigencia va de 0 a ${MAX_VALIDITY_DAYS} días (0: no vence).`,
    pattern: 'Escribe un número entero de días.',
  },
};

/**
 * Why a line cannot be added yet, in the order a person fixes them. Empty
 * when it can.
 */
export function addLineBlockers(state: {
  lineErrors: { description: boolean; quantity: boolean; minutes: boolean };
  priceInvalid: boolean;
  plates: number;
  calculated: boolean;
  missingSkus: number;
}): string[] {
  const reasons: string[] = [];
  if (state.lineErrors.description) reasons.push('escribe qué se cotiza');
  if (state.lineErrors.quantity) reasons.push(`la cantidad tiene que ser un número entero de 1 a ${UNITS_TEXT}`);
  if (state.lineErrors.minutes) reasons.push('revisa los minutos de preparación y de trabajo');
  if (state.plates === 0) reasons.push('agrega al menos una placa');
  else if (!state.calculated) reasons.push('elige la impresora');
  if (state.missingSkus > 0) reasons.push('asocia cada filamento a uno del inventario');
  if (state.priceInvalid) reasons.push('corrige el descuento o el recargo');
  return reasons;
}

/** A line that sells below what it costs, and how much is lost per unit. */
export interface LosingLine {
  description: string;
  lossPerUnit: number;
}

/** The lines whose price does not cover their cost, catalogue or made to order. */
export function losingLines(
  lines: readonly { draft: { description: string }; price: Pick<PriceBreakdown, 'marginAmount'> }[],
): LosingLine[] {
  return lines
    .filter((line) => line.price.marginAmount < 0)
    .map((line) => ({ description: line.draft.description, lossPerUnit: -line.price.marginAmount }));
}

/**
 * The last day a quote is valid, `days` after `today` ("YYYY-MM-DD", the
 * workshop's day). Zero is no end. Calendar days, not periods of 24 hours.
 */
export function validUntilFor(days: number, today: string): string | null {
  if (!Number.isInteger(days) || days <= 0) return null;
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}
