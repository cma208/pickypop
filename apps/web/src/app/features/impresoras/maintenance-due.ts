import { daysBetween, DEFAULT_TIMEZONE, localDate } from '../../core/dates';
import type { BadgeTone } from '../../ui';
import type { LogRecord, PlanRecord } from './impresoras.models';

export type DueState = 'overdue' | 'soon' | 'ok' | 'never';

/** A plan is "soon" once less than this share of its interval is left. */
export const SOON_FRACTION = 0.2;

/** Hours-only plans that were never logged sit between "soon" and "ok". */
const NEVER_LOGGED_URGENCY = 0.25;

export interface DueStatus {
  plan: PlanRecord;
  state: DueState;
  /** Lower means more urgent. Negative means overdue. */
  urgency: number;
  /** One sentence in Spanish: why it is in this state. */
  summary: string;
  neverLogged: boolean;
  lastDoneAt: string | null;
}

export const DUE_TONES: Record<DueState, BadgeTone> = {
  overdue: 'bad',
  soon: 'warn',
  ok: 'good',
  never: 'info',
};

export const DUE_LABELS: Record<DueState, string> = {
  overdue: 'Vencido',
  soon: 'Próximo',
  ok: 'Al día',
  never: 'Sin registro',
};

const HOURS = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function describeDays(daysLeft: number): string {
  if (daysLeft < 0) return `vencido hace ${plural(-daysLeft, 'día', 'días')}`;
  if (daysLeft === 0) return 'toca hoy';
  return `toca en ${plural(daysLeft, 'día', 'días')}`;
}

function describeHours(hoursLeft: number): string {
  return hoursLeft < 0
    ? `pasado por ${HOURS.format(-hoursLeft)} h de impresión`
    : `faltan ${HOURS.format(hoursLeft)} h de impresión`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Compares the last maintenance of a plan against the printer's current hours
 * and today's date. Whichever trigger comes first decides the state.
 *
 * Without a previous log the day count starts at the plan's creation date. The
 * hour count cannot start anywhere reliable, so hours-only plans are reported
 * as "never logged" until the first maintenance is recorded.
 */
export function evaluatePlan(
  plan: PlanRecord,
  lastLog: LogRecord | null,
  currentHours: number,
  today: string,
  timeZone = DEFAULT_TIMEZONE,
): DueStatus {
  const fractions: number[] = [];
  const reasons: string[] = [];

  if (plan.everyDays !== null) {
    const baseline = localDate(lastLog?.performedAt ?? plan.createdAt, timeZone);
    const daysLeft = plan.everyDays - daysBetween(baseline, today);
    fractions.push(daysLeft / plan.everyDays);
    reasons.push(describeDays(daysLeft));
  }

  if (plan.everyHours !== null && lastLog) {
    const hoursLeft = plan.everyHours - (currentHours - lastLog.printerHours);
    fractions.push(hoursLeft / plan.everyHours);
    reasons.push(describeHours(hoursLeft));
  }

  const base = { plan, neverLogged: lastLog === null, lastDoneAt: lastLog?.performedAt ?? null };

  if (fractions.length === 0) {
    const summary = 'Sin registros: las horas se cuentan desde el primer mantenimiento que registres';
    return { ...base, state: 'never', urgency: NEVER_LOGGED_URGENCY, summary };
  }

  const urgency = Math.min(...fractions);
  const state: DueState = urgency < 0 ? 'overdue' : urgency <= SOON_FRACTION ? 'soon' : 'ok';

  return { ...base, state, urgency, summary: capitalize(reasons.join(' · ')) };
}

/** The most recent log of every plan. Logs must come newest first. */
export function lastLogByPlan(logs: LogRecord[]): Map<string, LogRecord> {
  const latest = new Map<string, LogRecord>();
  for (const log of logs) {
    if (log.planId !== null && !latest.has(log.planId)) latest.set(log.planId, log);
  }
  return latest;
}

/** Active plans of one printer, most urgent first. */
export function dueStatuses(
  plans: PlanRecord[],
  logs: LogRecord[],
  currentHours: number,
  today: string,
): DueStatus[] {
  const latest = lastLogByPlan(logs);

  return plans
    .filter((plan) => plan.active)
    .map((plan) => evaluatePlan(plan, latest.get(plan.id) ?? null, currentHours, today))
    .sort((a, b) => a.urgency - b.urgency);
}

/** Overdue and soon-to-be-due items only: what needs attention now. */
export function needsAttention(statuses: DueStatus[]): DueStatus[] {
  return statuses.filter((status) => status.state === 'overdue' || status.state === 'soon');
}
