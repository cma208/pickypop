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
 * A job cancelled before anybody pressed «Iniciar» never ran: it has no real
 * time and no machine or power cost. The close used to save its estimate as
 * the real time and charge 0.15 for a print that did not happen.
 */
export function neverRan(startedAt: string | null, result: CloseResult): boolean {
  return result === 'cancelled' && startedAt === null;
}

/**
 * The seconds a closed job charges for machine and power, or null when it
 * charges nothing at all. A cancelled job charges what it ran and never its
 * estimate, which is what it would have taken to finish. A finished one
 * falls back to its estimate only when nobody said how long it took.
 */
export function chargedSeconds(
  job: { startedAt: string | null; estimatedTimeS: number | null },
  result: CloseResult,
  actualTimeS: number | null,
): number | null {
  if (neverRan(job.startedAt, result)) return null;
  if (result === 'cancelled') return actualTimeS ?? 0;
  return actualTimeS ?? job.estimatedTimeS ?? 0;
}
