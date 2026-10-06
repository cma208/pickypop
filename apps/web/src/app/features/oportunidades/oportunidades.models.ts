import type { Database } from '../../core/database.types';
import type { BadgeTone } from '../../ui';

export type Stage = Database['public']['Enums']['opportunity_stage'];

/**
 * El orden del tablero, que es el del embudo comercial. "Perdido" va al final
 * aunque no sea el último paso de nada: es la salida, y ponerla en medio
 * obligaría a saltársela con la vista cada vez que se lee el tablero.
 */
export const STAGES: Stage[] = ['new', 'quoted', 'negotiating', 'won', 'closed', 'lost'];

export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Nuevo',
  quoted: 'Cotizado',
  negotiating: 'Negociando',
  won: 'Ganado',
  closed: 'Cerrado',
  lost: 'Perdido',
};

export const STAGE_TONE: Record<Stage, BadgeTone> = {
  new: 'neutral',
  quoted: 'info',
  negotiating: 'info',
  won: 'good',
  closed: 'neutral',
  lost: 'bad',
};

/** Lo que cada columna significa, para que nadie tenga que adivinarlo. */
export const STAGE_HELP: Record<Stage, string> = {
  new: 'Alguien preguntó. Todavía no hay número encima.',
  quoted: 'Ya se le mandó al menos una cotización.',
  negotiating: 'Está respondiendo: precio, cantidades o fechas.',
  won: 'Se convirtió en pedido. Lo que falta es del taller.',
  closed: 'Todo entregado y cobrado. Llega solo, no se arrastra.',
  lost: 'No se concretó.',
};

/**
 * "Cerrado" lo decide la base a partir de los pedidos del trato, nunca una
 * pantalla. Aquí solo se usa para no ofrecer esa columna como destino.
 */
export function isDerived(stage: Stage): boolean {
  return stage === 'closed';
}

/** Las columnas a las que se puede soltar una tarjeta. */
export const DROPPABLE_STAGES: Stage[] = STAGES.filter((stage) => !isDerived(stage));

const MS_PER_DAY = 86_400_000;

/**
 * Días enteros desde el último movimiento del trato, contados en días de
 * calendario y no en periodos de 24 horas: lo que el dueño quiere saber es
 * "cuántas veces ha amanecido sin que pase nada", y algo de ayer a las once
 * de la noche lleva un día parado aunque hayan pasado dos horas.
 */
export function daysIdle(lastActivity: Date, today = new Date()): number {
  const from = Date.UTC(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate());
  const to = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

/** A partir de cuántos días parado la tarjeta se marca como olvidada. */
export const STALE_AFTER_DAYS = 7;

export interface SettlementCounts {
  /** Pedidos del trato, sin contar los cancelados. */
  orders: number;
  /** De esos, los que todavía no se entregaron. */
  openOrders: number;
  /** De esos, los que todavía deben dinero. */
  owingOrders: number;
}

/**
 * Por qué este trato todavía no está en "Cerrado", o null cuando ya nada lo
 * impide.
 *
 * La regla de verdad vive en la base (`app.opportunity_is_settled`): un trato
 * está cerrado cuando tiene pedidos y todos están entregados y cobrados. Esto
 * no la repite para decidir nada —la etapa que se pinta es la que manda la
 * base— sino para explicar en la tarjeta qué falta, que es la pregunta que
 * se hace quien mira el tablero.
 */
export function closedBlockers(counts: SettlementCounts): string | null {
  if (counts.orders === 0) return 'Todavía no hay ningún pedido en este trato.';

  const missing: string[] = [];
  if (counts.openOrders > 0) missing.push(`entregar ${pedidos(counts.openOrders)}`);
  if (counts.owingOrders > 0) missing.push(`cobrar ${pedidos(counts.owingOrders)}`);

  if (missing.length === 0) return null;
  return `Falta ${missing.join(' y ')}.`;
}

function pedidos(count: number): string {
  return count === 1 ? '1 pedido' : `${count} pedidos`;
}
