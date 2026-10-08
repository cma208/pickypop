/**
 * Every amount in the system is in Peruvian soles and is rounded to cents at
 * each step, so that a breakdown shown to a customer always adds up exactly.
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

const STEP_TOLERANCE = 1e-9;

/** Rounds a final price UP to the next commercial step (e.g. S/ 0.50). */
export function roundUpToStep(amount: number, step: number): number {
  if (step <= 0) return roundMoney(amount);
  const steps = Math.ceil(roundMoney(amount) / step - STEP_TOLERANCE);
  return roundMoney(steps * step);
}

export function sumMoney(amounts: number[]): number {
  return roundMoney(amounts.reduce((total, amount) => total + amount, 0));
}

const UNIT_SHARE_SCALE = 1e6;

/**
 * One unit's share of a total, to six decimals rather than cents: the
 * precision the kardex, the purchases and the order lines keep. A
 * batch of two that costs S/ 15.69 is 7.845 a unit: rounded to 7.85 and
 * multiplied back it would be S/ 15.70, and the order would disagree with the
 * quote by a cent. Six decimals give the batch back for any real quantity:
 * the error is below half a cent until ten thousand units.
 */
export function unitShare(total: number, units: number): number {
  if (!(units > 0)) throw new RangeError('units must be greater than 0');
  return Math.round((total / units) * UNIT_SHARE_SCALE) / UNIT_SHARE_SCALE;
}

/**
 * What `quantity` of something at `unitAmount` each comes to, rounded to
 * cents once: a quote line's total, a supply's cost on a quote. Multiplied
 * in a template, those skipped the rounding every other figure of the
 * breakdown goes through, and could disagree with the total by a cent.
 */
export function totalFor(unitAmount: number, quantity: number): number {
  return roundMoney(unitAmount * quantity);
}
