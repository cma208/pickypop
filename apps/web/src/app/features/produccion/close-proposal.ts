import { toHundredths } from './job-grams';
import { proposeTime, type CloseResult, type ProposedTime } from './job-time';

const PERCENT = 100;

/** What the close form writes in the time and grams fields before anybody types. */
export interface CloseProposal {
  time: ProposedTime | null;
  /** One per roll of the job, in its order; null leaves the field empty. */
  grams: (number | null)[];
}

/**
 * The real time and grams the close form proposes for a result.
 *
 * A print that finished took about its estimate, so «Exitosa» proposes it.
 * One that failed or was cancelled stopped somewhere, and its estimate is what
 * finishing would have taken: proposing it said that a planned job nobody
 * started, closed as failed, ran its 1000 h and used its 2 kg (T3-05). So it
 * proposes the share the percentage says it got to, and nothing while there is
 * no percentage: the person writes what happened.
 */
export function closeProposal(
  result: CloseResult,
  estimatedTimeS: number | null,
  estimatedGrams: readonly number[],
  percentComplete: number | null,
): CloseProposal {
  if (result === 'success') {
    return { time: proposeTime(estimatedTimeS), grams: [...estimatedGrams] };
  }
  if (percentComplete === null || !Number.isFinite(percentComplete) || percentComplete < 0 || percentComplete > PERCENT) {
    return { time: null, grams: estimatedGrams.map(() => null) };
  }
  const share = percentComplete / PERCENT;
  const seconds = estimatedTimeS === null ? null : Math.round(estimatedTimeS * share);
  return {
    time: proposeTime(seconds),
    grams: estimatedGrams.map((grams) => toHundredths(grams * share)),
  };
}
