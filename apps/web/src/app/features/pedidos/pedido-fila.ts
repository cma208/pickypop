import type { PlanDemandPlan, PlanInput, PlanResult } from '@pickypop/domain';
import { dateTimeLong } from '../../core/dates';
import { readyText } from '../../core/plan-format';

/**
 * The line an order waits in, and what moves when somebody passes ahead
 * (ADR-021). The rule is the owner's: who confirms or holds first goes first,
 * and a person may still choose another, after seeing who was there before.
 */

export interface QueuePlace {
  /** 1 for the first in line. */
  position: number;
  /** Those who go before it, nearest last. */
  ahead: PlanDemandPlan[];
}

/** Where an order stands among everything that claims stock and the queue. */
export function placeOf(result: PlanResult, orderId: string): QueuePlace | null {
  const index = result.demands.findIndex((demand) => demand.kind === 'order' && demand.id === orderId);
  if (index < 0) return null;
  return { position: index + 1, ahead: result.demands.slice(0, index) };
}

/** "PED-0003 · Ana Quispe". */
export function demandLabel(demand: Pick<PlanDemandPlan, 'number' | 'customerName'>): string {
  return demand.customerName ? `${demand.number} · ${demand.customerName}` : demand.number;
}

/**
 * The warning the owner asked for, before passing anybody: who was there
 * first and since when. A hold says until when it lasts, because it may end
 * on its own before the stock is needed.
 */
export function passWarning(target: PlanDemandPlan): string {
  const who = target.customerName ?? target.number;
  const since = dateTimeLong(target.priorityAt);
  if (target.holdUntil !== null) {
    return `${who} hizo un separo antes (${target.number}, ${since}), vigente hasta el ${dateTimeLong(target.holdUntil)}.`;
  }
  return `${who} confirmó antes (${target.number}, ${since}).`;
}

/**
 * The snapshot with the order placed right before the target, as
 * `prioritize_order` would leave it. The line is rebuilt in its new order
 * with one second between places: the plan only orders by `priorityAt`, and
 * the real instants can sit a millisecond apart, closer than a JavaScript
 * date can tell.
 */
export function withOrderAhead(input: PlanInput, orderId: string, targetId: string): PlanInput {
  const line = [...input.demands].sort(
    (a, b) =>
      Date.parse(a.priorityAt) - Date.parse(b.priorityAt) ||
      (a.number < b.number ? -1 : a.number > b.number ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const moving = line.find((demand) => demand.kind === 'order' && demand.id === orderId);
  if (!moving || !line.some((demand) => demand.id === targetId)) return input;

  const rest = line.filter((demand) => demand !== moving);
  const at = rest.findIndex((demand) => demand.id === targetId);
  rest.splice(at, 0, moving);

  const start = Date.parse(line[0]!.priorityAt);
  const places = new Map(rest.map((demand, index) => [demand, new Date(start + index * 1000).toISOString()]));
  return {
    ...input,
    demands: input.demands.map((demand) => ({ ...demand, priorityAt: places.get(demand) ?? demand.priorityAt })),
  };
}

export interface ReadyChange {
  label: string;
  from: string;
  to: string;
  /** It would be late after the change and was not before. */
  becomesLate: boolean;
}

/** Whose date moves, and how: "PED-0003 · Ana Quispe: de mañana 07:20 a jueves 8 de octubre, 10:18". */
export function readyChanges(before: PlanResult, after: PlanResult): ReadyChange[] {
  const previous = new Map(before.demands.map((demand) => [demand.id, demand]));
  return after.demands
    .map((demand) => ({ demand, old: previous.get(demand.id) }))
    .filter(({ demand, old }) => old !== undefined && old.readyAt !== demand.readyAt)
    .map(({ demand, old }) => ({
      label: demandLabel(demand),
      from: readyText(old!.readyAt, before.now),
      to: readyText(demand.readyAt, after.now),
      becomesLate: demand.late && !old!.late,
    }))
    // Minutes apart can read the same ("mañana 07:20"): that is not a change to show.
    .filter((change) => change.from !== change.to || change.becomesLate);
}

/** "Llega a tiempo: vence el jueves 8" or "Llega tarde: vence el martes 6". */
export function dueText(demand: Pick<PlanDemandPlan, 'dueDate' | 'late'>): string | null {
  if (!demand.dueDate) return null;
  const [year, month, day] = demand.dueDate.split('-').map(Number);
  const parts = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .formatToParts(new Date(Date.UTC(year!, month! - 1, day!, 12)));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const due = `${get('weekday')} ${get('day')} de ${get('month')}`;
  return demand.late ? `Llega tarde: vence el ${due}.` : `Llega a tiempo: vence el ${due}.`;
}
