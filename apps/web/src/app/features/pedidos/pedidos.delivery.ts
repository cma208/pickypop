import { inputToIso } from '../../core/dates';

/**
 * The browser side of delivering an order. What can leave the shelf, and how
 * much of it, is decided by `deliver_order` in the database: nothing here
 * checks stock or pending quantities, it only turns the form into the call.
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
