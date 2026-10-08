import type { Database } from '../../core/database.types';

type FailureCause = Database['public']['Enums']['print_failure_cause'];
type JobStatus = Database['public']['Enums']['print_job_status'];

export interface WeekAttempts {
  successful: number;
  /** Failed, and cancelled after they ran. */
  failed: number;
  /** Of the failed, how many were cancelled halfway: the label says it. */
  cancelledRan: number;
}

/**
 * The prints that were tried, counted as `failure_stats` and Resultados count
 * them (ADR-023, point 6): a cancelled print that ran cost machine, power and
 * filament, and is a failed attempt. One cancelled before it ran never
 * started, cost nothing and is no attempt at all. Before this the box read
 * only successes and failures, and said 0 % failed in a week when Resultados
 * took off what a cancelled mould cost.
 */
export function weekAttempts(jobs: readonly { status: JobStatus; actual_time_s: number | null }[]): WeekAttempts {
  let successful = 0;
  let failed = 0;
  let cancelledRan = 0;
  for (const job of jobs) {
    if (job.status === 'success') successful += 1;
    else if (job.status === 'failed') failed += 1;
    else if (job.status === 'cancelled' && job.actual_time_s !== null) {
      failed += 1;
      cancelledRan += 1;
    }
  }
  return { successful, failed, cancelledRan };
}

/**
 * The causes behind the most failures: one when it stands out, all of them on
 * a tie, in the order they first appear (newest first, as the panel reads
 * them). With one warping and one adhesion, naming adhesion alone as «la más
 * común» was the order of the enum speaking, not the workshop: `mode()` in
 * the `failure_stats` view picked the first value it sorted.
 */
export function commonCauses(causes: readonly (FailureCause | null)[]): FailureCause[] {
  const counts = new Map<FailureCause, number>();
  for (const cause of causes) {
    if (cause) counts.set(cause, (counts.get(cause) ?? 0) + 1);
  }
  const most = Math.max(0, ...counts.values());
  if (most === 0) return [];
  return [...counts].filter(([, count]) => count === most).map(([cause]) => cause);
}

/** «fallidas», saying how many of them were cancelled halfway when there are. */
export function failedLabel(cancelledRan: number): string {
  if (cancelledRan <= 0) return 'fallidas';
  return cancelledRan === 1 ? 'fallidas (1 cancelada a medias)' : `fallidas (${cancelledRan} canceladas a medias)`;
}

/** "a", "a y b", "a, b y c": causes, printers, anything the panel lists in a sentence. */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}
