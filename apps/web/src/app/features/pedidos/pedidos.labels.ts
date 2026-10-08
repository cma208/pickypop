import type { BadgeTone } from '../../ui';
import type { Database } from '../../core/database.types';

type Enums = Database['public']['Enums'];

export type OrderPurpose = Enums['order_purpose'];
export type OrderStatus = Enums['order_status'];
export type OrderPaymentStatus = Enums['order_payment_status'];
export type PaymentMethod = Enums['payment_method'];

export const PURPOSE_LABEL: Record<OrderPurpose, string> = {
  sale: 'Venta',
  personal: 'Uso personal',
  gift: 'Regalo',
};

export const PURPOSE_TONE: Record<OrderPurpose, BadgeTone> = {
  sale: 'good',
  personal: 'info',
  gift: 'warn',
};

export const PURPOSE_HELP: Record<OrderPurpose, string> = {
  sale: 'Se le cobra a un cliente. Necesita cliente y lleva precio.',
  personal: 'Para el taller o para ti. No lleva precio: se registra cuánto costó.',
  gift: 'Algo que regalas. Necesita una categoría y no lleva precio: se registra cuánto costó.',
};

export const PURPOSES: OrderPurpose[] = ['sale', 'personal', 'gift'];

/**
 * How a line gets made. A catalogue line comes off the shelf and «Por lanzar»
 * prints what is missing for every order at once (ADR-021); made-to-order
 * work is printed for this line alone; a service is not printed at all.
 */
export type LineKind = Enums['quote_line_kind'];

/**
 * Lines without a variant are made to order unless the quote they came from
 * says they were a service. One written by hand in «Nuevo pedido» has no
 * quote, and there «A medida» is the only kind without a variant.
 */
export function lineKind(variantId: string | null, quoteKind: LineKind | null): LineKind {
  if (variantId !== null) return 'catalog';
  return quoteKind === 'service' ? 'service' : 'custom';
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  confirmed: 'Confirmado',
  queued: 'En cola',
  printing: 'Imprimiendo',
  post_processing: 'Post-proceso',
  ready: 'Listo',
  delivered: 'Entregado',
  closed: 'Cerrado',
  on_hold: 'En espera',
  cancelled: 'Cancelado',
};

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  confirmed: 'neutral',
  queued: 'info',
  printing: 'info',
  post_processing: 'info',
  ready: 'good',
  delivered: 'good',
  closed: 'neutral',
  on_hold: 'warn',
  cancelled: 'bad',
};

/** The normal path of an order, in order. On hold and cancelled sit outside it. */
export const STATUS_FLOW: OrderStatus[] = [
  'confirmed',
  'queued',
  'printing',
  'post_processing',
  'ready',
  'delivered',
  'closed',
];

export const ALL_STATUSES: OrderStatus[] = [...STATUS_FLOW, 'on_hold', 'cancelled'];

/** What the list of orders shows: one status, the ones still in progress, or all of them. */
export type StatusFilter = OrderStatus | 'all' | 'open';

/** How a link asks for a filter of the list, in `?estado=`, besides a status by its name. */
const STATUS_FILTER_IN_LINKS = new Map<string, StatusFilter>([
  ['todos', 'all'],
  ['en-curso', 'open'],
]);

/**
 * The filter a link asks for: «todos», «en-curso» or one status. Anything
 * else opens on the orders in progress, as the list always did. A screen that
 * sends people to look for a delivered order (a quick sale is born
 * delivered) has to ask for it: «En curso» would never show it.
 */
export function statusFilterFromLink(value: string | null): StatusFilter {
  if (value === null) return 'open';
  return STATUS_FILTER_IN_LINKS.get(value) ?? ALL_STATUSES.find((status) => status === value) ?? 'open';
}

/** The step after the given one, or null when the order is at the end or off the path. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = STATUS_FLOW.indexOf(status);
  return index >= 0 && index < STATUS_FLOW.length - 1 ? STATUS_FLOW[index + 1]! : null;
}

export function isFinal(status: OrderStatus): boolean {
  return status === 'closed' || status === 'cancelled';
}

/**
 * "Entregado" y "Cerrado" se alcanzan entregando, no eligiéndolos: mientras
 * quede algo por entregar, la base rechaza ponerlos a mano
 * (`orders_delivered_means_delivered`), porque el estante seguiría teniendo lo
 * que el pedido dice que ya se llevó el cliente.
 */
export const REACHED_BY_DELIVERING: readonly OrderStatus[] = ['delivered', 'closed'];

/** Lo que ofrece la ficha como paso siguiente: cambiar de estado, o entregar. */
export type NextStep = { kind: 'status'; status: OrderStatus } | { kind: 'deliver' };

/**
 * El paso que sigue, sin ofrecer nunca uno que la base va a rechazar: si el
 * siguiente es "Entregado" y queda algo por entregar, el paso es entregar.
 */
export function nextStep(status: OrderStatus, hasPending: boolean): NextStep | null {
  const next = nextStatus(status);
  if (next === null) return null;
  if (hasPending && REACHED_BY_DELIVERING.includes(next)) return { kind: 'deliver' };
  return { kind: 'status', status: next };
}

/**
 * «Poner en espera» y «Cancelar pedido» solo mientras nada salió del taller.
 * Un pedido entregado y cobrado se pudo cancelar (ORD-2026-0001): Resultados
 * pasó a ventas S/ 0 con la plata en las cuentas y las calaveras fuera del
 * estante. La base ya lo rechaza; aquí ni se ofrece.
 */
export function canStopOrder(status: OrderStatus, hasDeliveries: boolean): boolean {
  if (isFinal(status) || REACHED_BY_DELIVERING.includes(status)) return false;
  return !hasDeliveries;
}

const MONEY = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/**
 * Por qué todavía no se puede cancelar, o null si se puede. Lo cobrado sigue
 * en las cuentas mientras no se anule, y anular un cobro es de Caja: deja
 * rastro y pide motivo, que es justo lo que un cambio de estado no hace.
 * Desde el 2026-10-08 anular es solo del dueño (ADR-025): al operador se le
 * dice a quién pedírselo, no que lo haga.
 */
export function cancelBlocker(paid: number | null, isOwner = true): string | null {
  if (paid === null || paid <= 0) return null;
  return isOwner
    ? `Este pedido tiene ${MONEY.format(paid)} cobrados. Para cancelarlo, primero anula esos cobros en Caja.`
    : `Este pedido tiene ${MONEY.format(paid)} cobrados. Para cancelarlo hay que anular esos cobros, y anular es solo del dueño: pídeselo, y después cancélalo.`;
}

/** Dónde se puede retomar un pedido en espera, por la misma regla. */
export function resumeTargets(hasPending: boolean): OrderStatus[] {
  return hasPending ? STATUS_FLOW.filter((step) => !REACHED_BY_DELIVERING.includes(step)) : [...STATUS_FLOW];
}

/**
 * Posición en el camino normal, o null para los que se salen de él. Es el
 * mismo orden que `app.order_status_rank` en la base, que es quien manda: lo
 * de aquí solo sirve para pedir el motivo antes de que lo exija la base, y no
 * para decidir si se puede.
 */
export function statusRank(status: OrderStatus): number | null {
  const index = STATUS_FLOW.indexOf(status);
  return index >= 0 ? index + 1 : null;
}

/** Volver a un paso ya pasado. Es lo único que obliga a decir por qué. */
export function isBackwards(from: OrderStatus, to: OrderStatus): boolean {
  const before = statusRank(from);
  const after = statusRank(to);
  return before !== null && after !== null && after < before;
}

/** Los pasos a los que este pedido puede volver. */
export function previousStatuses(status: OrderStatus): OrderStatus[] {
  const index = STATUS_FLOW.indexOf(status);
  return index > 0 ? STATUS_FLOW.slice(0, index) : [];
}

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  not_applicable: 'No aplica',
  unpaid: 'Sin cobrar',
  partial: 'Cobro parcial',
  paid: 'Cobrado',
};

export const PAYMENT_STATUS_TONE: Record<OrderPaymentStatus, BadgeTone> = {
  not_applicable: 'neutral',
  unpaid: 'warn',
  partial: 'info',
  paid: 'good',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transfer: 'Transferencia',
};

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'yape', 'plin', 'transfer'];
