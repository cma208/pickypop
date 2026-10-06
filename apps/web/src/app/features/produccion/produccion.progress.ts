/**
 * How far along a print is.
 *
 * Nobody is going to walk to the machine and type a percentage into a form, so
 * the only progress worth showing is the one the system can work out on its
 * own: it knows when the job started and how long the slicer said it would
 * take. It is an estimate and it says so — a print that stalls keeps counting —
 * but "va por el 70 %, le faltan 23 minutos" is the question being asked at
 * nine in the morning, and a blank space answers nothing.
 */
export interface JobProgress {
  /** 0 to 1, or null when there is no estimate to measure against. */
  fraction: number | null;
  elapsedS: number;
  /** Seconds left by the estimate; negative means it is running long. */
  remainingS: number | null;
  /** Past its estimate and still open: worth looking at. */
  overdue: boolean;
}

export function jobProgress(
  startedAt: string | null,
  estimatedTimeS: number | null,
  now: Date = new Date(),
): JobProgress | null {
  if (!startedAt) return null;

  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;

  const elapsedS = Math.max(0, Math.round((now.getTime() - started) / 1000));

  if (!estimatedTimeS || estimatedTimeS <= 0) {
    return { fraction: null, elapsedS, remainingS: null, overdue: false };
  }

  const remainingS = estimatedTimeS - elapsedS;
  return {
    // Capped at 1: a bar that fills past the end reads as broken, and the
    // "va largo" wording already carries that news.
    fraction: Math.min(1, elapsedS / estimatedTimeS),
    elapsedS,
    remainingS,
    overdue: remainingS < 0,
  };
}
