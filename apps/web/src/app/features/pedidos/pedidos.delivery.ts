import type { PlanDemandPlan } from '@pickypop/domain';
import { inputToIso } from '../../core/dates';
import { roundMoney, sumMoney } from '../../core/pricing';
import type { LineKind } from './pedidos.labels';

/**
 * The browser side of delivering an order. What can leave the shelf, and how
 * much of it, is decided by `deliver_order` in the database: nothing here
 * checks stock or pending quantities, it only turns the form into the call.
 * What the form proposes comes from the plan, the same account that tells the
 * order page what is on the shelf for it (ADR-021).
 */

/** How much of one line goes out today, as the form holds it. */
export interface DeliveryQuantity {
  orderLineId: string;
  /** What is still pending: the form starts here. */
  pending: number;
  /** What the person left in the field. Empty counts as zero. */
  quantity: number | null;
}

/**
 * One element of `p_lines`, exactly as `deliver_order` reads it. A type and
 * not an interface, so it fits the generated `Json` without a cast.
 */
export type DeliveryLinePayload = {
  order_line_id: string;
  quantity: number;
};

/** Hour of the day a delivery dated another day is recorded at, in Lima. */
const BACKDATED_TIME = '12:00';

/**
 * The lines that go out today. A zero means "not this line, not today", so it
 * is left out instead of sent.
 */
export function deliveryPayload(rows: readonly DeliveryQuantity[]): DeliveryLinePayload[] {
  return rows
    .filter((row) => (row.quantity ?? 0) !== 0)
    .map((row) => ({ order_line_id: row.orderLineId, quantity: row.quantity ?? 0 }));
}

/**
 * What the plan says is ready to hand over today, line by line: assembled
 * units on the shelf for this order, a whole kit, made-to-order work already
 * printed. Already in priority order, so a unit another order is waiting for
 * first is not offered here. Null when the plan does not have the order (it
 * could not be read, or the order is not active), and then nobody can say.
 */
export function readyByLine(
  result: { demands: readonly Pick<PlanDemandPlan, 'kind' | 'id' | 'lines'>[] } | null,
  orderId: string,
): Map<string, number> | null {
  const demand = result?.demands.find((candidate) => candidate.kind === 'order' && candidate.id === orderId);
  if (!demand) return null;
  return new Map(demand.lines.map((line) => [line.lineId, line.onShelf]));
}

/**
 * Where the form starts: what is pending and ready today, never more than
 * either. It used to start with everything pending, and «Entregar todo
 * (2 unidades)» read as if both were there when only one was assembled.
 * Without the plan nothing is proposed: an empty form asks, a full one guesses.
 */
export function deliverableToday(lines: readonly { id: string; pending: number }[], ready: ReadonlyMap<string, number> | null): number[] {
  return lines.map((line) => Math.max(0, Math.min(line.pending, ready?.get(line.id) ?? 0)));
}

/** «Van a salir N unidades del estante», as the confirmation says it before anything moves. */
export function deliveryConfirmation(rows: readonly { quantity: number | null; kind: LineKind }[]): string {
  const count = (kind: (value: LineKind) => boolean) =>
    rows.filter((row) => kind(row.kind)).reduce((total, row) => total + Math.max(row.quantity ?? 0, 0), 0);
  const fromShelf = count((kind) => kind === 'catalog');
  const madeForIt = count((kind) => kind !== 'catalog');

  const parts: string[] = [];
  if (fromShelf > 0) {
    parts.push(fromShelf === 1 ? 'Va a salir 1 unidad del estante.' : `Van a salir ${fromShelf} unidades del estante.`);
  }
  if (madeForIt > 0) {
    parts.push(
      madeForIt === 1
        ? 'Se entrega 1 unidad hecha para este pedido.'
        : `Se entregan ${madeForIt} unidades hechas para este pedido.`,
    );
  }
  return [...parts, 'Esto no se puede deshacer.'].join(' ');
}

/** Units leaving today, for the button and the confirmation. */
export function unitsLeaving(rows: readonly DeliveryQuantity[]): number {
  return rows.reduce((total, row) => total + Math.max(row.quantity ?? 0, 0), 0);
}

/** Units still pending across the order. */
export function unitsPending(rows: readonly { pending: number }[]): number {
  return rows.reduce((total, row) => total + row.pending, 0);
}

/** True when the form still says "everything that is missing". */
export function deliversEverything(rows: readonly DeliveryQuantity[]): boolean {
  return rows.length > 0 && rows.every((row) => row.quantity === row.pending);
}

/**
 * The moment the delivery is recorded at. Today leaves it to the database,
 * which stamps the real time; another day (a delivery written down late) is
 * recorded at noon in Lima, so it never slides to the day before.
 */
export function deliveredAtFor(day: string, today: string): string | null {
  return day === today ? null : inputToIso(`${day}T${BACKDATED_TIME}`);
}

/** The button says exactly what is about to happen. */
export function deliverButtonLabel(rows: readonly DeliveryQuantity[]): string {
  const leaving = unitsLeaving(rows);
  if (leaving === 0) return 'Elige qué se entrega';
  if (deliversEverything(rows)) return leaving === 1 ? 'Entregar todo (1 unidad)' : `Entregar todo (${leaving} unidades)`;
  const pending = unitsPending(rows);
  // More than pending is the database's to refuse, with a message that says
  // which line; the button only avoids reading "5 de 2" meanwhile.
  return leaving <= pending ? `Entregar ${leaving} de ${pending}` : `Entregar ${leaving}`;
}

/** One row of `order_line_delivery_status`, as the list of orders reads it. */
export interface LineDeliveryRow {
  orderId: string;
  quantity: number;
  delivered: number;
  pending: number;
}

/** An order that has started to leave but is not all out yet. */
export interface PartialDelivery {
  delivered: number;
  ordered: number;
}

/**
 * Orders delivered in part, by id. Only those: an order with nothing out yet,
 * or with everything out, is told by its status.
 */
export function partialDeliveries(rows: readonly LineDeliveryRow[]): Map<string, PartialDelivery> {
  const totals = new Map<string, { delivered: number; ordered: number; pending: number }>();
  for (const row of rows) {
    const total = totals.get(row.orderId) ?? { delivered: 0, ordered: 0, pending: 0 };
    total.delivered += row.delivered;
    total.ordered += row.quantity;
    total.pending += row.pending;
    totals.set(row.orderId, total);
  }

  const partial = new Map<string, PartialDelivery>();
  for (const [orderId, { delivered, ordered, pending }] of totals) {
    if (delivered > 0 && pending > 0) partial.set(orderId, { delivered, ordered });
  }
  return partial;
}

/**
 * What the estimate said the delivered units would cost, line by line, so it
 * can stand next to what they really cost when they left the shelf.
 */
export function deliveredEstimate(lines: readonly { estimatedUnitCost: number; delivered: number }[]): number {
  return sumMoney(lines.map((line) => roundMoney(line.estimatedUnitCost * line.delivered)));
}

/** Real minus estimated, rounded like every other amount. */
export function costDifference(real: number, estimated: number): number {
  return roundMoney(real - estimated);
}
