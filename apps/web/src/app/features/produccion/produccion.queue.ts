/**
 * The order of the print queue, the same one the plan simulates: on each
 * printer, planned jobs run in the order they were queued, and two queued in
 * the same instant (one "Poner en cola" of several runs) by id.
 */

export interface QueuedJob {
  id: string;
  printerId: string;
  printerName: string;
  createdAt: string;
}

export interface QueueLane<T extends QueuedJob> {
  printerId: string;
  printerName: string;
  jobs: T[];
}

/** Plain code-unit order, like the plan's tie-break: localeCompare would sort ids differently. */
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function queueLanes<T extends QueuedJob>(jobs: readonly T[]): QueueLane<T>[] {
  const lanes = new Map<string, QueueLane<T>>();
  const sorted = [...jobs].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || compareIds(a.id, b.id));
  for (const job of sorted) {
    const lane = lanes.get(job.printerId) ?? { printerId: job.printerId, printerName: job.printerName, jobs: [] };
    lane.jobs.push(job);
    lanes.set(job.printerId, lane);
  }
  return [...lanes.values()].sort((a, b) => a.printerName.localeCompare(b.printerName, 'es'));
}
