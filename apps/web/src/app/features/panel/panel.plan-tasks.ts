import type { PlanDemandPlan, PlanInput, PlanShortage } from '@pickypop/domain';
import { daysBetween, localDate } from '../../core/dates';
import type { PhotoRef } from '../../core/article-photos';
import type { PlanView } from '../../core/plan';
import { NO_PRINTER_WARNING, readyText } from '../../core/plan-format';
import { amount } from '../inventario/stock-position';
import type { TodayTask } from './panel.tasks';

/**
 * What «Hoy» learns from the plan (ADR-021): holds about to lapse, orders
 * the queue will not make in time, what to buy for the confirmed orders and
 * the plan's own warnings that ask somebody to do something.
 *
 * Pure, like `panel.tasks.ts`: the wording around a day is where an
 * off-by-one hides, and here it is tested against the real `plan`.
 */

/** A hold that ends today or tomorrow is today's business: the customer has to answer before it lapses. */
export const HOLD_LOOKAHEAD_DAYS = 1;

const COUNT = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const MS_PER_SECOND = 1000;

export function orderTitle(number: string, customerName: string | null): string {
  return customerName ? `${customerName} · ${number}` : `Pedido ${number}`;
}

function dayParts(day: string): { weekday: string; day: string; month: string } {
  // Noon UTC of that day, read in UTC: no time zone can move it to the day before.
  const parts = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${day}T12:00:00Z`));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { weekday: get('weekday'), day: get('day'), month: get('month') };
}

/** "hoy", "mañana", "ayer" or "el jueves 8" (with the month when it is another one). */
export function dayWords(day: string, today: string): string {
  const days = daysBetween(today, day);
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  const parts = dayParts(day);
  const month = day.slice(0, 7) === today.slice(0, 7) ? '' : ` de ${parts.month}`;
  return `el ${parts.weekday} ${parts.day}${month}`;
}

function clockTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
    new Date(iso),
  );
}

/**
 * "Vence el jueves 8 y sale el viernes 9." A day, and the hour only when it
 * is today: tomorrow at 07:20 or at 09:00 is the same promise to a customer.
 */
export function lateWording(dueDate: string, readyAt: string, now: string, timeZone: string, needsPurchase = false): string {
  const today = localDate(now, timeZone);
  const due = `${daysBetween(today, dueDate) < 0 ? 'Venció' : 'Vence'} ${dayWords(dueDate, today)}`;
  const readyDay = localDate(readyAt, timeZone);
  const ready = readyDay === today ? `hoy ${clockTime(readyAt, timeZone)}` : dayWords(readyDay, today);
  const purchase = needsPurchase ? ', si hoy se compra lo que falta' : '';
  return `${due} y sale ${ready}${purchase}.`;
}

/** Confirmed orders that, in this order of the queue, are ready after the day promised. */
export function lateOrderTasks(view: PlanView): TodayTask[] {
  const { result, input } = view;
  return result.demands
    .filter((demand) => demand.kind === 'order' && demand.holdUntil === null && demand.late && demand.dueDate)
    .map((demand): TodayTask => ({
      // Same key as the due-date task of the order: this one says more, and replaces it.
      key: `order:${demand.id}`,
      urgency: 'late',
      title: orderTitle(demand.number, demand.customerName),
      detail: lateWording(demand.dueDate!, demand.readyAt, result.now, input.settings.timeZone, demand.needsPurchase),
      route: `/pedidos/${demand.id}`,
      photo: { kind: 'order', id: demand.id },
      kind: 'product',
    }));
}

/** "10 × Botella de poción", or how many units in all when the hold has several lines. */
function holdContents(demand: PlanDemandPlan): string {
  if (demand.lines.length === 1) {
    const line = demand.lines[0]!;
    return `${COUNT.format(line.quantity)} × ${line.description}`;
  }
  const units = demand.lines.reduce((sum, line) => sum + line.quantity, 0);
  return `${COUNT.format(units)} ${units === 1 ? 'unidad' : 'unidades'}`;
}

/** A quote has no photo of its own: it shows its first product. */
function demandPhoto(demand: PlanDemandPlan, input: PlanInput): PhotoRef {
  if (demand.kind === 'order') return { kind: 'order', id: demand.id };
  const lines = input.demands.find((candidate) => candidate.id === demand.id)?.lines ?? [];
  return { kind: 'variant', id: lines.find((line) => line.variantId)?.variantId ?? null };
}

/**
 * «Vence el separo de María Pérez (COT-0012, 10 pociones) hoy 18:00»: the
 * quote or the order is where it is extended or let go.
 */
export function holdTasks(view: PlanView): TodayTask[] {
  const { result, input } = view;
  const timeZone = input.settings.timeZone;
  const today = localDate(result.now, timeZone);
  return result.demands.flatMap((demand) => {
    if (demand.holdUntil === null) return [];
    const days = daysBetween(today, localDate(demand.holdUntil, timeZone));
    if (days < 0 || days > HOLD_LOOKAHEAD_DAYS) return [];
    const task: TodayTask = {
      key: `hold:${demand.kind}:${demand.id}`,
      urgency: days === 0 ? 'today' : 'soon',
      title: demand.customerName ? `Vence el separo de ${demand.customerName}` : 'Vence un separo',
      detail: `${demand.number}, ${holdContents(demand)} · ${readyText(demand.holdUntil, result.now, timeZone)}`,
      route: demand.kind === 'quote' ? `/cotizaciones/${demand.id}` : `/pedidos/${demand.id}`,
      photo: demandPhoto(demand, input),
      kind: 'product',
    };
    return [task];
  });
}

/** "2.38 kg de Dulces surtidos y 12.76 g de PLA Rosado". */
export function shoppingList(shortages: readonly PlanShortage[]): string {
  const parts = shortages.map((shortage) => `${amount(shortage.missing, shortage.unit)} de ${shortage.label}`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** What the confirmed orders lack, added up thing by thing. A hold never asks to buy (ADR-021). */
export function confirmedShortages(view: PlanView): { shortages: PlanShortage[]; orders: string[] } {
  const totals = new Map<string, PlanShortage>();
  const orders = new Set<string>();
  for (const demand of view.result.demands) {
    if (demand.kind !== 'order' || demand.holdUntil !== null) continue;
    for (const shortage of demand.lines.flatMap((line) => line.shortages)) {
      const key = `${shortage.kind}:${shortage.id ?? shortage.label}`;
      const total = totals.get(key);
      if (total) total.missing += shortage.missing;
      else totals.set(key, { ...shortage });
      orders.add(demand.number);
    }
  }
  return { shortages: [...totals.values()], orders: [...orders] };
}

/** «Falta comprar 2.38 kg de Dulces surtidos y 12.76 g de PLA Rosado», with the way to «Compras». */
export function purchaseTask(view: PlanView): TodayTask | null {
  const { shortages, orders } = confirmedShortages(view);
  if (shortages.length === 0) return null;
  const forWhom = orders.length === 1 ? orders[0] : `${orders.length} pedidos`;
  const firstItem = shortages.find((shortage) => shortage.kind === 'item' && shortage.id);
  return {
    key: 'purchase',
    urgency: 'today',
    title: 'Falta comprar',
    detail: `${shoppingList(shortages)}, para ${forWhom}.`,
    route: '/inventario/compras',
    photo: firstItem ? { kind: 'item', id: firstItem.id } : null,
    kind: firstItem ? 'supply' : 'spool',
  };
}

interface WarningRule {
  pattern: RegExp;
  /** Null: another task of «Hoy» already says it. */
  task: ((match: RegExpMatchArray, printersRegistered: boolean) => Pick<TodayTask, 'title' | 'detail' | 'route' | 'kind'>) | null;
}

/**
 * The plan's warnings are sentences, so they are recognised by their words,
 * and `panel.plan-tasks.spec.ts` runs the real plan to keep the two in step.
 * Only the ones that ask somebody to do something become tasks: a plate
 * longer than the window is a condition, like low filament, not a deadline.
 */
const WARNING_RULES: WarningRule[] = [
  // «Impresión sin cerrar» already asks to close it, with the plate's photo.
  { pattern: /pasó su tiempo estimado/, task: null },
  {
    pattern: /^"(.+)" no tiene receta/,
    task: (match) => ({
      title: match[1]!,
      detail: 'No tiene receta: el plan no sabe cómo hacerla. Cárgala en Catálogo y recetas.',
      route: '/catalogo',
      kind: 'product',
    }),
  },
  {
    pattern: /^La receta de "(.+)" no tiene piezas ni insumos/,
    task: (match) => ({
      title: match[1]!,
      detail: 'Su receta no tiene piezas ni insumos: el plan no sabe cómo hacer lo que falta. Cárgalos en Catálogo y recetas.',
      route: '/catalogo',
      kind: 'product',
    }),
  },
  {
    pattern: NO_PRINTER_WARNING,
    // The plan cannot tell a printer in maintenance from a workshop that
    // never registered one; «Hoy» can, and the second is a missing step.
    task: (_match, printersRegistered) =>
      printersRegistered
        ? {
            title: 'Ninguna impresora disponible',
            detail: 'Las fechas del plan suponen que vuelve una ahora mismo.',
            route: '/impresoras',
            kind: 'printer',
          }
        : {
            title: 'Falta registrar la impresora',
            detail: 'Sin ella el plan no sabe cuándo se imprime nada. Regístrala en Impresoras.',
            route: '/impresoras',
            kind: 'printer',
          },
  },
];

export function warningTasks(warnings: readonly string[], printersRegistered = true): TodayTask[] {
  return warnings.flatMap((warning) => {
    for (const rule of WARNING_RULES) {
      const match = warning.match(rule.pattern);
      if (!match) continue;
      if (!rule.task) return [];
      const task: TodayTask = {
        key: `warning:${warning}`,
        urgency: 'today',
        photo: null,
        ...rule.task(match, printersRegistered),
      };
      return [task];
    }
    return [];
  });
}

/** Jobs on a printer whose estimated end has passed: most likely done, and nobody closed them. */
export function pastEstimateJobs(input: PlanInput): Set<string> {
  const now = Date.parse(input.now);
  return new Set(
    input.jobs
      .filter((job) => job.status === 'printing' && job.startedAt !== null)
      .filter((job) => Date.parse(job.startedAt!) + job.estimatedSeconds * MS_PER_SECOND < now)
      .map((job) => job.id),
  );
}

/** Everything the plan adds to «Hoy», late orders first. */
export function planTasks(view: PlanView, printersRegistered = true): TodayTask[] {
  const purchase = purchaseTask(view);
  return [
    ...lateOrderTasks(view),
    ...holdTasks(view),
    ...(purchase ? [purchase] : []),
    ...warningTasks(view.result.warnings, printersRegistered),
  ];
}

/** One task per key: the first one wins, so the list that says more goes first. */
export function uniqueTasks(tasks: readonly TodayTask[]): TodayTask[] {
  const seen = new Set<string>();
  return tasks.filter((task) => !seen.has(task.key) && seen.add(task.key));
}
