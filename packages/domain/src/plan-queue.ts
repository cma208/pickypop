import type { PlanJob, PlanPrinter, PrintWindow } from './plan-types.ts';
import { MS_PER_MINUTE, formatMinuteOfDay, parseInstant, type WorkshopClock } from './plan-time.ts';

export const MS_PER_SECOND = 1000;
/** Run counts come from rates like 0.1: 30 × 0.1 is 3.0000000000000004, not a reason for a fourth run. */
const COUNT_EPSILON = 1e-9;

/** Where one plate goes and when. */
export interface Placement {
  printerId: string;
  start: number;
  end: number;
}

/** One printer as the plan sees it. */
interface Lane {
  printerId: string;
  /** End of the last plate on it. Null while nothing is on it: the first plate starts right away. */
  busyUntil: number | null;
  /** False for a printer that is not available: its old jobs still end, but nothing new goes there. */
  acceptsRuns: boolean;
}

/** Warnings worth reading once each, in the order they came up. */
export class Warnings {
  private readonly texts = new Set<string>();

  add(text: string): void {
    this.texts.add(text);
  }

  list(): string[] {
    return [...this.texts];
  }
}

/** "19 h", "3 h 20 min", "45 min". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / MS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/**
 * The printers, plate after plate, inside the window.
 *
 * Jobs already on a printer go first and are never moved: the plan only
 * fills what is left. Every plate after the first on a printer waits the
 * changeover, because somebody has to take the bed out and start the next one.
 */
export class PrintQueue {
  private readonly lanes: Lane[];
  /** When each job already on a printer is expected to end. */
  readonly jobEnds = new Map<string, number>();
  /** When each job already launched starts (or started), for the queue to show its time. */
  readonly jobStarts = new Map<string, number>();

  constructor(
    printers: PlanPrinter[],
    jobs: PlanJob[],
    private readonly clock: WorkshopClock,
    private readonly window: PrintWindow,
    private readonly now: number,
    private readonly changeoverMs: number,
    private readonly warnings: Warnings,
    jobName: (job: PlanJob) => string,
  ) {
    this.lanes = printers.map((printer) => ({
      printerId: printer.id,
      busyUntil: null,
      acceptsRuns: true,
    }));
    if (this.lanes.length === 0) {
      warnings.add(
        'No hay ninguna impresora disponible: las fechas suponen que vuelve una ahora mismo.',
      );
      this.lanes.push({ printerId: '', busyUntil: null, acceptsRuns: true });
    }
    this.simulateJobs(jobs, jobName);
  }

  /** Puts a new run on the printer that can start it first. Ties go to the printer listed first. */
  place(durationMs: number, label: string): Placement {
    let best: { lane: Lane; start: number } | null = null;
    for (const lane of this.lanes) {
      if (!lane.acceptsRuns) continue;
      const start = this.startOn(lane.busyUntil, durationMs, label);
      if (best === null || start < best.start) best = { lane, start };
    }
    // The constructor guarantees at least one lane that accepts runs.
    const { lane, start } = best!;
    const end = start + durationMs;
    lane.busyUntil = end;
    return { printerId: lane.printerId, start, end };
  }

  /**
   * When `count` spare runs of `durationMs` would end if they went right
   * after `after` on its printer. It moves nobody: it is a bound for "if a
   * plate fails", not a new schedule.
   */
  endOfSpares(after: Placement, count: number, durationMs: number): number {
    let end = after.end;
    for (let spare = 0; spare < count; spare++) {
      end = this.clock.plateStart(end + this.changeoverMs, durationMs).start + durationMs;
    }
    return end;
  }

  /** Spare runs for a share of failures: one per run in ten at 0.1, or fraction. */
  static sparesFor(runs: number, failureRate: number): number {
    if (runs <= 0 || failureRate <= 0) return 0;
    return Math.ceil(runs * failureRate - COUNT_EPSILON);
  }

  private startOn(busyUntil: number | null, durationMs: number, label: string): number {
    const from = busyUntil === null ? this.now : busyUntil + this.changeoverMs;
    const slot = this.clock.plateStart(from, durationMs);
    if (!slot.fits) this.warnDoesNotFit(label, durationMs);
    return slot.start;
  }

  private warnDoesNotFit(label: string, durationMs: number): void {
    const { firstStart, endBy } = this.window;
    this.warnings.add(
      `La placa "${label}" dura ${formatDuration(durationMs)} y no cabe en el horario ` +
        `(${formatMinuteOfDay(firstStart)} a ${formatMinuteOfDay(endBy)}): ` +
        `se programa igual a las ${formatMinuteOfDay(firstStart)}.`,
    );
  }

  private laneOf(printerId: string): Lane {
    let lane = this.lanes.find((candidate) => candidate.printerId === printerId);
    if (!lane) {
      lane = { printerId, busyUntil: null, acceptsRuns: false };
      this.lanes.push(lane);
    }
    return lane;
  }

  private simulateJobs(jobs: PlanJob[], jobName: (job: PlanJob) => string): void {
    for (const job of jobs.filter((candidate) => candidate.status === 'printing')) {
      const lane = this.laneOf(job.printerId);
      const started = job.startedAt === null ? this.now : parseInstant(job.startedAt);
      let end = started + job.estimatedSeconds * MS_PER_SECOND;
      if (end < this.now) {
        // Nobody closed it. It is most likely done; the plan cannot know.
        this.warnings.add(
          `"${jobName(job)}" pasó su tiempo estimado: ¿terminó? Ciérrala para que el plan lo sepa.`,
        );
        end = this.now;
      }
      lane.busyUntil = Math.max(lane.busyUntil ?? end, end);
      this.jobStarts.set(job.id, started);
      this.jobEnds.set(job.id, end);
    }

    const planned = jobs
      .filter((candidate) => candidate.status === 'planned')
      .sort(
        (a, b) => parseInstant(a.queuedAt) - parseInstant(b.queuedAt) || compareText(a.id, b.id),
      );
    for (const job of planned) {
      const lane = this.laneOf(job.printerId);
      const durationMs = job.estimatedSeconds * MS_PER_SECOND;
      const start = this.startOn(lane.busyUntil, durationMs, jobName(job));
      lane.busyUntil = start + durationMs;
      this.jobStarts.set(job.id, start);
      this.jobEnds.set(job.id, lane.busyUntil);
    }
  }
}

/** Plain code-unit order: the same on every machine, unlike localeCompare. */
export function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
