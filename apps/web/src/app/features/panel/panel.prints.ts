import type { Database } from '../../core/database.types';

type FailureCause = Database['public']['Enums']['print_failure_cause'];

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

/** "a", "a y b", "a, b y c". */
export function joinCauses(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}
