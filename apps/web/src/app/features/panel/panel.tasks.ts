import type { ArticleKind, PhotoRef } from '../../core/article-photos';

/**
 * The pure parts of the "what do I do today" queue, kept apart from the
 * queries so they can be tested. The wording around a due date is exactly
 * where an off-by-one hides: "se entregaba ayer" and "se entrega hoy" differ
 * by one day and by how hard you run.
 */

/** How soon something needs doing. Drives the order of the list and its badge. */
export type TaskUrgency = 'late' | 'today' | 'soon';

export interface TodayTask {
  key: string;
  urgency: TaskUrgency;
  /** What it is, in a few words: "Pedido P-0003". */
  title: string;
  /** Why it is on the list today. */
  detail: string;
  route: string;
  /** What the row looks like: the order's product, the job's plate. */
  photo: PhotoRef | null;
  /** The icon when there is no photo to show. */
  kind: ArticleKind;
}

/** Lower sorts first. */
export const URGENCY_ORDER: Record<TaskUrgency, number> = { late: 0, today: 1, soon: 2 };

/** How far ahead a due date has to be before it stops being today's problem. */
export const LOOKAHEAD_DAYS = 3;

/** A print left open longer than this was forgotten, not running. */
export const STALE_PRINT_DAYS = 1;

const MONEY = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/** `days` is calendar days from today to the due date: negative means past. */
export function urgencyForDueDate(days: number): TaskUrgency {
  if (days < 0) return 'late';
  return days === 0 ? 'today' : 'soon';
}

export function dueWording(days: number): string {
  if (days < -1) return `Se entregaba hace ${-days} días.`;
  if (days === -1) return 'Se entregaba ayer.';
  if (days === 0) return 'Se entrega hoy.';
  if (days === 1) return 'Se entrega mañana.';
  return `Se entrega en ${days} días.`;
}

/**
 * `days` is how long the job has been open. `pastEstimate` is the plan's
 * warning that its estimated time is over: said here, once, instead of as a
 * second task for the same print.
 */
export function openPrintWording(days: number, pastEstimate = false): string {
  if (days < STALE_PRINT_DAYS) {
    return pastEstimate
      ? 'Pasó su tiempo estimado: ¿terminó? Ciérrala para que su costo entre y el plan lo sepa.'
      : 'En la máquina. Ciérrala al terminar para que su costo entre.';
  }
  const unit = days === 1 ? 'día' : 'días';
  return `Empezó hace ${days} ${unit} y sigue abierta: su costo no entró todavía.`;
}

export function owingWording(balance: number): string {
  return `Entregado y debe ${MONEY.format(balance)}.`;
}

export function byUrgency(a: TodayTask, b: TodayTask): number {
  return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
}
