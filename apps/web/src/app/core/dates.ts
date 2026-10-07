/** Date helpers shared by the forms. All of them work in the workshop's local time. */

export const DEFAULT_TIMEZONE = 'America/Lima';

/** "2026-10-04" for a moment, as seen in the given time zone. */
export function localDate(value: string | Date, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function todayLocal(timeZone = DEFAULT_TIMEZONE): string {
  return localDate(new Date(), timeZone);
}

/** Whole calendar days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** Value for an `<input type="datetime-local">` representing "now". */
export function nowForInput(timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Converts a datetime-local value (Lima time) to an ISO instant. */
export function inputToIso(value: string): string {
  const LIMA_OFFSET = '-05:00'; // Peru has no daylight saving time.
  return new Date(`${value}:00${LIMA_OFFSET}`).toISOString();
}

/** Value for an `<input type="datetime-local">` showing an instant in Lima time. */
export function isoToInput(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * "miércoles 7 de octubre, 23:00": a moment as a person says it. Holds and
 * promised times are always shown like this, never as a duration.
 */
export function dateTimeLong(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('es-PE', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${get('weekday')} ${get('day')} de ${get('month')}, ${get('hour')}:${get('minute')}`;
}
