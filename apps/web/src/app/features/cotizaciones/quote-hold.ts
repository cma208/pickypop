import { dateTimeLong, inputToIso } from '../../core/dates';

/**
 * What a sent quote holds right now. The rule is the database's: a hold lasts
 * until a moment that has not passed yet. Nothing writes "expired": the moment
 * simply goes by.
 */
export type HoldState =
  | { kind: 'active'; until: string }
  | { kind: 'expired'; until: string }
  | { kind: 'none' };

const DATETIME_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function holdState(holdUntil: string | null, now: Date = new Date()): HoldState {
  if (holdUntil === null) return { kind: 'none' };

  return new Date(holdUntil).getTime() > now.getTime()
    ? { kind: 'active', until: holdUntil }
    : { kind: 'expired', until: holdUntil };
}

/** Where the order of an accepted quote goes in the line, said before it is created. */
export interface AcceptPlace {
  keeps: boolean;
  text: string;
}

/**
 * Mirrors what `accept_quote` decides, so the panel can say it before the
 * click: a hold still running gives the order the quote's place, anything
 * else puts it at the end of the line.
 */
export function acceptPlace(heldAt: string | null, holdUntil: string | null, now: Date = new Date()): AcceptPlace {
  const state = holdState(holdUntil, now);

  if (state.kind === 'active' && heldAt !== null) {
    return { keeps: true, text: `Conserva su lugar en la fila: separó el ${dateTimeLong(heldAt)}.` };
  }
  if (state.kind === 'expired') {
    return {
      keeps: false,
      text: `El separo venció el ${dateTimeLong(state.until)}: entra a la fila ahora, después de los pedidos que ya están.`,
    };
  }
  return { keeps: false, text: 'No separó nada: entra a la fila ahora, después de los pedidos que ya están.' };
}

/**
 * Why a new end for the hold cannot be used, or null when it can. A moment
 * already gone would let go of the hold, which has its own button and its own
 * question: it is not done by mistake from a date field.
 */
export function holdUntilProblem(input: string, now: Date = new Date()): string | null {
  if (!DATETIME_INPUT.test(input)) return 'Elige el día y la hora.';
  if (new Date(inputToIso(input)).getTime() <= now.getTime()) {
    return 'Esa hora ya pasó. Elige una más adelante.';
  }
  return null;
}
