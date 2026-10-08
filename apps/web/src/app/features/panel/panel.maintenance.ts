import { joinLabels } from './panel.prints';

/** Which printers the maintenance plans keep an eye on. */
export interface MaintenanceCoverage {
  /** Printers registered, retired ones included. */
  registered: number;
  /** Printers not retired. */
  inUse: number;
  /** Names of the printers in use that no active plan watches. */
  unwatched: string[];
}

/** A line of the Mantenimiento card of Hoy, besides the alerts. */
export interface MaintenanceNote {
  text: string;
  tone: 'positive' | 'muted';
  /** It ends by sending the person to create plans. */
  plansLink: boolean;
}

/** The printers in use that have no active plan, by name. */
export function unwatchedPrinters(
  printers: readonly { id: string; name: string }[],
  plans: readonly { printerId: string; active: boolean }[],
): string[] {
  const watched = new Set(plans.filter((plan) => plan.active).map((plan) => plan.printerId));
  return printers.filter((printer) => !watched.has(printer.id)).map((printer) => printer.name);
}

/**
 * What the card says besides its alerts. No alert from a printer without
 * plans means nothing is counting its hours, not that it is up to date:
 * with a watched A1 mini and a second printer without plans, «las impresoras
 * están al día» vouched for the one nobody watches. So "al día" is said only
 * of the watched ones, and the others are named.
 */
export function maintenanceNotes(coverage: MaintenanceCoverage, alerts: number): MaintenanceNote[] {
  if (coverage.registered === 0) return [muted('Todavía no hay impresoras registradas.')];
  if (coverage.inUse === 0) return [muted('Todas las impresoras están retiradas: no hay mantenimiento que seguir.')];

  const watched = coverage.inUse - coverage.unwatched.length;
  const notes: MaintenanceNote[] = [];
  const unwatched = unwatchedText(coverage.unwatched, watched);
  if (unwatched) notes.push({ text: unwatched, tone: 'muted', plansLink: true });
  if (alerts === 0 && watched > 0) notes.push({ text: upToDateText(coverage, watched), tone: 'positive', plansLink: false });
  return notes;
}

function unwatchedText(names: readonly string[], watched: number): string | null {
  if (names.length === 0) return null;
  if (watched === 0) return 'Todavía no hay planes de mantenimiento, así que nada avisa cuándo toca.';
  const who = joinLabels(names.map((name) => `«${name}»`));
  return names.length === 1
    ? `${who} no tiene planes de mantenimiento, así que nada avisa cuándo le toca.`
    : `${who} no tienen planes de mantenimiento, así que nada avisa cuándo les toca.`;
}

function upToDateText(coverage: MaintenanceCoverage, watched: number): string {
  if (coverage.unwatched.length === 0) {
    return watched === 1
      ? 'Sin mantenimientos pendientes: la impresora está al día.'
      : 'Sin mantenimientos pendientes: las impresoras están al día.';
  }
  return watched === 1
    ? 'La otra impresora no tiene mantenimientos pendientes.'
    : 'Las demás impresoras no tienen mantenimientos pendientes.';
}

function muted(text: string): MaintenanceNote {
  return { text, tone: 'muted', plansLink: false };
}
