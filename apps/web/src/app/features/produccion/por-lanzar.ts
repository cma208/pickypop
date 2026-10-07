import type { PlanDemandPlan, PlanInput, PlanProposal, PlanResult, PlanRun } from '@pickypop/domain';
import { localDate } from '../../core/dates';
import { duration } from '../../core/format';
import { readyText } from '../../core/plan-format';
import { describeCounts } from './produccion.outputs';

/**
 * «Por lanzar» as a person reads it: what each proposal of the plan means,
 * who is late with the queue as it is, and the jobs "Poner en cola" creates.
 *
 * Nothing here counts runs, grams or dates: the plan already did, once, for
 * the whole app (ADR-021). These functions only pick from its result and say
 * it in words, so this screen cannot disagree with the order page or the
 * seller about what is missing.
 */

const MS_PER_DAY = 86_400_000;
const MS_PER_SECOND = 1000;
/** Runs of one line whose durations differ by less than this are "the same plate". */
const SAME_DURATION_S = 1;

/**
 * «Por lanzar» narrowed to one order, as the order page links to it: only the
 * plates that print something it is waiting for. The runs still serve
 * everyone the plate covers; this only hides what the order does not need.
 */
export function proposalsFor(proposals: readonly PlanProposal[], orderId: string | null): PlanProposal[] {
  if (orderId === null) return [...proposals];
  return proposals.filter((proposal) => proposal.covers.some((order) => order.id === orderId));
}

/** How the filtered order is named: its number when the plan knows it. */
export function orderNumberIn(result: PlanResult, orderId: string): string | null {
  const demand = result.demands.find((candidate) => candidate.kind === 'order' && candidate.id === orderId);
  if (demand) return demand.number;
  const covered = result.proposals.flatMap((proposal) => proposal.covers).find((order) => order.id === orderId);
  return covered?.number ?? null;
}

/** One row of «Por lanzar». A plate prints for everybody; made-to-order work for its line only. */
export function proposalKey(proposal: Pick<PlanProposal, 'plateId' | 'lineId'>): string {
  return proposal.lineId ? `line:${proposal.lineId}` : `plate:${proposal.plateId}`;
}

/** The made-to-order runs of a proposal, in the order the plan placed them. */
function lineRuns(proposal: PlanProposal, runs: readonly PlanRun[]): PlanRun[] {
  return runs
    .filter((run) => run.lineId === proposal.lineId)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

function runSeconds(run: PlanRun): number {
  return (Date.parse(run.end) - Date.parse(run.start)) / MS_PER_SECOND;
}

/**
 * How long one run takes, when every run of the proposal takes the same. A
 * catalogue plate always does; a made-to-order line with two different
 * plates does not, and then there is no honest "× 43 min" to show.
 */
function uniformRunSeconds(proposal: PlanProposal, runs: readonly PlanRun[]): number | null {
  if (proposal.runs <= 0) return null;
  if (proposal.lineId === null) return proposal.printSeconds / proposal.runs;
  const seconds = lineRuns(proposal, runs).map(runSeconds);
  if (seconds.length === 0) return proposal.printSeconds / proposal.runs;
  const first = seconds[0]!;
  return seconds.every((value) => Math.abs(value - first) < SAME_DURATION_S) ? first : null;
}

/** "32 corridas × 43 min · 22 h 56 min en total", or "1 corrida de 43 min". */
export function runsText(proposal: PlanProposal, runs: readonly PlanRun[]): string {
  const each = uniformRunSeconds(proposal, runs);
  const total = duration(proposal.printSeconds);
  if (proposal.runs === 1) return `1 corrida de ${total}`;
  const count = `${proposal.runs} corridas`;
  return each === null ? `${count} · ${total} en total` : `${count} × ${duration(each)} · ${total} en total`;
}

/** "Cada corrida deja 9 Tapa". Null for made-to-order work, whose pieces are the line itself. */
export function yieldText(proposal: PlanProposal, input: PlanInput): string | null {
  const plate = input.plates.find((candidate) => candidate.id === proposal.plateId);
  if (!plate || plate.outputs.length === 0) return null;
  const names = new Map(input.items.map((item) => [item.id, item.name]));
  const counts = plate.outputs.map((output) => ({ name: names.get(output.itemId) ?? 'pieza', units: output.units }));
  return `Cada corrida deja ${describeCounts(counts)}`;
}

export interface FilamentRow {
  skuId: string | null;
  label: string;
  grams: number;
  /** This proposal runs short of it: launching all its runs would empty the spools. */
  short: boolean;
}

/**
 * The grams of each filament, and which one does not reach. The proposal only
 * says "something is short"; the filament positions say which, because they
 * come from the same pass that marked the proposal.
 */
export function filamentRows(proposal: PlanProposal, result: PlanResult): FilamentRow[] {
  const missing = new Map(result.filaments.map((row) => [row.skuId, row.missingGrams]));
  return proposal.filaments.map((use) => ({
    skuId: use.skuId,
    label: use.label,
    grams: use.grams,
    short: !proposal.enoughFilament && use.skuId !== null && (missing.get(use.skuId) ?? 0) > 0,
  }));
}

/** "Empezaría hoy 22:02", or "Puede empezar ya" when a printer is free now. */
export function startText(proposal: PlanProposal, now: string, timeZone: string): string {
  const when = readyText(proposal.firstStart, now, timeZone);
  return when === 'ya' ? 'La primera corrida puede empezar ya' : `La primera corrida empezaría ${when}`;
}

// ------------------------------------------------------------------ holds

export interface HoldRef {
  kind: 'order' | 'quote';
  id: string;
  number: string;
  customerName: string | null;
  holdUntil: string;
}

function isHold(demand: PlanDemandPlan): boolean {
  return demand.kind === 'quote' || demand.holdUntil !== null;
}

/**
 * Whether a hold took something this plate makes: the piece itself from the
 * shelf, the queue or another run, or a finished unit whose recipe uses it
 * (which leaves the orders behind needing one more).
 */
function tookFromPlate(demand: PlanDemandPlan, input: PlanInput, items: ReadonlySet<string>): boolean {
  const source = input.demands.find((candidate) => candidate.kind === demand.kind && candidate.id === demand.id);
  return demand.lines.some((line) => {
    const tookPiece = line.components.some(
      (component) => items.has(component.itemId) && component.fromStock + component.fromQueue + component.toPrint > 0,
    );
    if (tookPiece) return true;
    const variantId = source?.lines.find((candidate) => candidate.id === line.lineId)?.variantId ?? null;
    const recipe = input.recipes.find((candidate) => candidate.variantId === variantId);
    return line.onShelf > 0 && !!recipe?.components.some((component) => items.has(component.itemId));
  });
}

/**
 * The holds that made some of these runs necessary (ADR-021, point 6): the
 * proforma or the order on hold that goes before the orders this proposal
 * covers and took what this plate makes. When none can be pinned down, every
 * hold ahead of them is named: better a hold too many than an unexplained number.
 */
export function holdsBehind(proposal: PlanProposal, result: PlanResult, input: PlanInput): HoldRef[] {
  if (proposal.becauseOfHolds <= 0) return [];
  const positions = proposal.covers.map((order) =>
    result.demands.findIndex((demand) => demand.kind === 'order' && demand.id === order.id),
  );
  const last = Math.max(-1, ...positions);
  const ahead = result.demands.slice(0, last >= 0 ? last : result.demands.length).filter(isHold);
  const items = new Set(
    input.plates.find((plate) => plate.id === proposal.plateId)?.outputs.map((output) => output.itemId) ?? [],
  );
  const took = ahead.filter((demand) => tookFromPlate(demand, input, items));
  return (took.length > 0 ? took : ahead).map((demand) => ({
    kind: demand.kind,
    id: demand.id,
    number: demand.number,
    customerName: demand.customerName,
    holdUntil: demand.holdUntil ?? result.now,
  }));
}

/** "4 de estas corridas son por el separo de" / "1 de estas corridas es por los separos de". */
export function holdLead(runs: number, holds: number): string {
  const verb = runs === 1 ? '1 de estas corridas es' : `${runs} de estas corridas son`;
  return `${verb} por ${holds === 1 ? 'el separo' : 'los separos'} de`;
}

/** "vence mañana 23:00", "vence el jueves 8 de octubre, 23:00". */
export function holdEndText(holdUntil: string, now: string, timeZone: string): string {
  const when = readyText(holdUntil, now, timeZone);
  if (when === 'ya') return 'ya venció';
  return /^(hoy|mañana) /.test(when) ? `vence ${when}` : `vence el ${when}`;
}

// ------------------------------------------------------------------ late

export interface LateNotice {
  orderId: string;
  number: string;
  customerName: string | null;
  /** "vence el jueves 8 y con este orden sale el viernes 9". */
  text: string;
}

const WEEKDAY_DAY = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric' });
const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * "jueves 8" for a calendar day, with the month only when it is not this
 * month's. The day is built at noon UTC and printed in UTC, so the zone of
 * the browser can never move it to the evening before.
 */
export function dayName(day: string, today: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const noon = new Date(Date.UTC(year!, month! - 1, date!, 12));
  const sameMonth = day.slice(0, 7) === today.slice(0, 7);
  const parts = (sameMonth ? WEEKDAY_DAY : WEEKDAY_DAY_MONTH).formatToParts(noon);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const base = `${get('weekday')} ${get('day')}`;
  return sameMonth ? base : `${base} de ${get('month')}`;
}

interface Days {
  today: string;
  tomorrow: string;
  yesterday: string;
}

function daysAround(now: string, timeZone: string): Days {
  const at = Date.parse(now);
  return {
    today: localDate(now, timeZone),
    tomorrow: localDate(new Date(at + MS_PER_DAY), timeZone),
    yesterday: localDate(new Date(at - MS_PER_DAY), timeZone),
  };
}

function dueText(due: string, days: Days): string {
  if (due === days.today) return 'vence hoy';
  if (due === days.tomorrow) return 'vence mañana';
  if (due === days.yesterday) return 'venció ayer';
  return `${due < days.today ? 'venció' : 'vence'} el ${dayName(due, days.today)}`;
}

function readyDayText(day: string, days: Days): string {
  if (day === days.today) return 'sale hoy';
  if (day === days.tomorrow) return 'sale mañana';
  return `sale el ${dayName(day, days.today)}`;
}

/**
 * Confirmed orders that the queue, as it stands, gets out after the day
 * promised. The date never reorders anything (decision of the owner): it
 * only raises the alarm, and whoever reads it decides whether to pass that
 * order ahead from its page.
 */
export function lateNotices(result: PlanResult, timeZone: string): LateNotice[] {
  const days = daysAround(result.now, timeZone);
  return result.demands
    .filter((demand) => demand.kind === 'order' && demand.holdUntil === null && demand.late && demand.dueDate)
    .map((demand) => ({
      orderId: demand.id,
      number: demand.number,
      customerName: demand.customerName,
      text: `${dueText(demand.dueDate!, days)} y con este orden ${readyDayText(localDate(demand.readyAt, timeZone), days)}`,
    }));
}

// ------------------------------------------------------------------ queue

/** One job "Poner en cola" creates: one per run, waiting for its turn. */
export interface RunToQueue {
  plateId: string | null;
  /** Only for made-to-order work: catalogue production goes to the common pool (ADR-019). */
  orderLineId: string | null;
  label: string | null;
  estimatedTimeS: number | null;
}

/** Whole runs between one and all of them: "Poner en cola" never creates zero or more than proposed. */
export function clampRuns(count: number, proposal: Pick<PlanProposal, 'runs'>): number {
  if (!Number.isFinite(count)) return proposal.runs;
  return Math.min(proposal.runs, Math.max(1, Math.floor(count)));
}

function seconds(value: number): number | null {
  return value > 0 ? Math.round(value) : null;
}

/**
 * The first `count` runs of a proposal as jobs. A catalogue plate goes
 * without an order: the plan decides whose its pieces are when they come
 * out, so tying them to one order would lie the moment priorities change. A
 * made-to-order run belongs to its line, and its pieces never reach the shelf.
 */
export function runsToQueue(proposal: PlanProposal, view: { input: PlanInput; result: PlanResult }, count: number): RunToQueue[] {
  const wanted = clampRuns(count, proposal);
  if (proposal.lineId === null) {
    const plate = view.input.plates.find((candidate) => candidate.id === proposal.plateId);
    const each = plate ? plate.printSeconds : proposal.printSeconds / proposal.runs;
    return Array.from({ length: wanted }, () => ({
      plateId: proposal.plateId,
      orderLineId: null,
      label: null,
      estimatedTimeS: seconds(each),
    }));
  }

  const runs = lineRuns(proposal, view.result.runs).slice(0, wanted);
  // With one plate the job is called like its line; with several, by line and plate.
  const plates = new Set(lineRuns(proposal, view.result.runs).map((run) => run.label));
  return runs.map((run) => ({
    plateId: null,
    orderLineId: proposal.lineId,
    label: plates.size > 1 ? `${proposal.label} · ${run.label}` : null,
    estimatedTimeS: seconds(runSeconds(run)),
  }));
}
