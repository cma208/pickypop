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

/** The step after the given one, or null when the order is at the end or off the path. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = STATUS_FLOW.indexOf(status);
  return index >= 0 && index < STATUS_FLOW.length - 1 ? STATUS_FLOW[index + 1]! : null;
}

export function isFinal(status: OrderStatus): boolean {
  return status === 'closed' || status === 'cancelled';
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
