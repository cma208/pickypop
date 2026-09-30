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
