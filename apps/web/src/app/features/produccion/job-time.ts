/**
 * The time of a print job, between the seconds the database keeps and the
 * whole minutes a person types.
 *
 * A plate or a queued job knows its time to the second (1334 s) and the field
 * shows it rounded (22 min). Saving the rounded figure back lost 14 seconds on
 * the way: the machine hour of the back of the skull came out at 0.15 instead
 * of 0.16, and the real cost one cent under the quote that used the plate's
 * own seconds. So the minutes are only converted when the person changed
 * them; left as proposed, the seconds they came from are what is saved.
 */

import { sumMoney } from '../../core/pricing';

export const SECONDS_PER_MINUTE = 60;

/** What the field proposes, and the exact time it was rounded from. */
export interface ProposedTime {
  seconds: number;
  minutes: number;
}

/** Whole minutes for the field, never zero: a 20-second plate still takes a minute to say. */
export function proposeTime(seconds: number | null | undefined): ProposedTime | null {
  if (seconds == null || seconds <= 0) return null;
  return { seconds, minutes: Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE)) };
}

/**
 * The seconds to save for what the field says. The proposal's own seconds
 * while the field still shows its minutes, like «Qué se imprime» follows the
 * plate while nobody rewrote it; the typed minutes otherwise.
 */
export function secondsToSave(minutes: number | null | undefined, proposed: ProposedTime | null): number | null {
  if (minutes == null || minutes <= 0) return null;
  if (proposed && minutes === proposed.minutes) return proposed.seconds;
  return minutes * SECONDS_PER_MINUTE;
}

/** How a job is closed. */
export type CloseResult = 'success' | 'failed' | 'cancelled';

/**
 * The seconds a closed job charges for machine and power, or null when it
 * charges nothing at all.
 *
 * A cancelled job charges what it ran and never its estimate, which is what
 * finishing would have taken: the close used to save the estimate of a job
 * nobody started as its real time and charge 0.15 for a print that did not
 * happen. With no time, nothing ran, so there is no cost. Pressing «Iniciar»
 * does not decide it: a plate launched on the printer without it and stopped
 * halfway wore the machine all the same, and the person says for how long.
 *
 * A finished one falls back to its estimate only when nobody said how long
 * it took.
 */
export function chargedSeconds(
  job: { estimatedTimeS: number | null },
  result: CloseResult,
  actualTimeS: number | null,
): number | null {
  if (result === 'cancelled') return actualTimeS;
  return actualTimeS ?? job.estimatedTimeS ?? 0;
}

/** What a closed job saved about its cost. */
export interface SavedCost {
  status: string;
  actualTimeS: number | null;
  materialCost: number | null;
  energyCost: number | null;
  machineCost: number | null;
}

/**
 * The «Costo real» of a job, or null when there is none to show.
 *
 * A cancelled job without a time never ran, and says so the same way whether
 * its costs were left empty (the queue) or written as zeros (cancelling it
 * with its order): neither is a «Costo real: S/ 0.00» of a print.
 */
export function realCostOf(job: SavedCost): number | null {
  if (job.status === 'cancelled' && job.actualTimeS === null) return null;
  const costs = [job.materialCost, job.energyCost, job.machineCost];
  if (costs.every((cost) => cost === null)) return null;
  return sumMoney(costs.map((cost) => Number(cost ?? 0)));
}
