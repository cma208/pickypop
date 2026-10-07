/**
 * The printing window and the default hold, as the settings form holds them.
 *
 * The database stores midnight as '24:00', which no time input can show: the
 * form shows it as 00:00 and says so, and this file is the only place that
 * translates between the two.
 */

export interface ScheduleDraft {
  /** "06:00". */
  firstStart: string;
  /** "23:00". */
  lastStart: string;
  /** "00:00" in the form means midnight at the end of the day. */
  endBy: string;
  changeoverMinutes: number;
  /** 0 is the same day, 1 the next. */
  holdDays: number;
  holdTime: string;
}

export interface ScheduleRecord extends ScheduleDraft {
  /** What the plan is using now: the measured value once there are enough samples. */
  measuredMinutes: number | null;
  samples: number;
}

/** Below this many measured changeovers the plan keeps using the default. */
export const MIN_CHANGEOVER_SAMPLES = 5;

const MIDNIGHT_IN_DB = '24:00';
const MIDNIGHT_IN_FORM = '00:00';

/** "06:00:00" from the database, "06:00" for the form. */
export function timeFromDb(value: string | null | undefined, fallback: string): string {
  const time = (value ?? fallback).slice(0, 5);
  return time === MIDNIGHT_IN_DB ? MIDNIGHT_IN_FORM : time;
}

/** The end of the window: 00:00 in the form is the midnight that closes the day. */
export function endByToDb(value: string): string {
  return value === MIDNIGHT_IN_FORM ? MIDNIGHT_IN_DB : value;
}

function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

function endByMinutes(time: string): number {
  return time === MIDNIGHT_IN_FORM ? 24 * 60 : minutes(time);
}

/** Why the window cannot be saved, in words for the person; null when it can. */
export function scheduleProblem(draft: ScheduleDraft): string | null {
  const first = minutes(draft.firstStart);
  const last = minutes(draft.lastStart);
  const end = endByMinutes(draft.endBy);
  if (first >= last) return 'La última placa tiene que poder empezar después de la primera.';
  if (last > end) return 'La última placa no puede empezar después de la hora en que todo tiene que haber terminado.';
  if (!Number.isInteger(draft.changeoverMinutes) || draft.changeoverMinutes < 0) {
    return 'El cambio de placa es un número de minutos, cero o más.';
  }
  if (!Number.isInteger(draft.holdDays) || draft.holdDays < 0) return 'Elige cuándo vence un separo.';
  return null;
}

/** "Una placa de 3 h puede empezar hasta las 21:00": the window, said with an example. */
export function windowExample(draft: ScheduleDraft, hours = 3): string {
  const latest = Math.min(minutes(draft.lastStart), endByMinutes(draft.endBy) - hours * 60);
  if (latest < minutes(draft.firstStart)) return `Una placa de ${hours} h no cabe en este horario.`;
  const hh = String(Math.floor(latest / 60)).padStart(2, '0');
  const mm = String(latest % 60).padStart(2, '0');
  return `Por ejemplo, una placa de ${hours} h puede empezar hasta las ${hh}:${mm}.`;
}
