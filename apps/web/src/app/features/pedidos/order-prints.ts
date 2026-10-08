import { duration, grams } from '../../core/format';
import type { JobItem } from '../produccion/produccion.data';
import { rollName } from '../produccion/produccion.spools';

/**
 * A print the order put in the queue and that is still alive there: what
 * cancelling the order has to decide about (E4-01). The owner asked to see,
 * before deciding, what it is, how long it takes and which roll it uses.
 */
export interface QueuedPrint {
  id: string;
  /** As the queue names it. */
  name: string;
  /** Already on the printer: it spent filament and is closed in the queue, not here. */
  printing: boolean;
  /** «20 min en A1 mini». */
  time: string;
  /** «PLA-BLANCO-01 · PLA Blanco (5 g)», or that the roll is chosen when it starts. */
  rolls: string;
  plateThumbnailPath: string | null;
}

const NO_ROLLS = 'El rollo se elige al iniciar.';

/** Planned or printing, in queue order. A closed one is history: there is nothing left to decide. */
export function queuedPrints(jobs: readonly JobItem[]): QueuedPrint[] {
  return jobs
    .filter((job) => job.status === 'planned' || job.status === 'printing')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((job) => ({
      id: job.id,
      name: job.label ?? job.lineDescription ?? job.plateLabel ?? 'Impresión sin nombre',
      printing: job.status === 'printing',
      time: `${job.estimatedTimeS ? duration(job.estimatedTimeS) : 'Sin tiempo estimado'} en ${job.printerName}`,
      rolls:
        job.filaments.length === 0
          ? NO_ROLLS
          : job.filaments.map((roll) => `${rollName(roll)} (${grams(roll.estimatedG)})`).join(', '),
      plateThumbnailPath: job.plateThumbnailPath,
    }));
}

/** «una impresión planificada», «3 impresiones planificadas». */
export function plannedCount(count: number): string {
  return count === 1 ? 'una impresión planificada' : `${count} impresiones planificadas`;
}

/** The owner's question, with both answers spelled out so neither is a surprise. */
export function cancelQuestion(planned: number): string {
  return planned === 1
    ? '¿Cancelas también la impresión planificada? Nunca se imprimió: se cancela sin tiempo ni costo. Si no, queda en la cola como trabajo suelto, sin pedido.'
    : `¿Cancelas también las ${planned} impresiones planificadas? Nunca se imprimieron: se cancelan sin tiempo ni costo. Si no, quedan en la cola como trabajos sueltos, sin pedido.`;
}

/**
 * What the order page says once the order is cancelled, so the person knows
 * where the prints went: gone with the order, or loose in the queue.
 */
export function cancelNotice(planned: number, cancelPrints: boolean | null): string | null {
  if (planned === 0 || cancelPrints === null) return null;
  const what = plannedCount(planned);
  if (cancelPrints) return `También se ${planned === 1 ? 'canceló' : 'cancelaron'} ${what}, sin tiempo ni costo.`;
  return planned === 1
    ? `Su impresión planificada quedó en la cola como trabajo suelto, sin pedido.`
    : `Sus ${planned} impresiones planificadas quedaron en la cola como trabajos sueltos, sin pedido.`;
}
