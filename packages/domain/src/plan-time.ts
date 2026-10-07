import type { MinuteOfDay, PrintWindow } from './plan-types.ts';

/**
 * Wall-clock arithmetic for the plan, in the workshop's time zone.
 *
 * The window is written in local hours ("not before 6:00"), but every instant
 * the plan handles is absolute. Mixing them up is the bug this project already
 * paid for once (a Lima date read as UTC lands on the previous evening), so the
 * conversion lives here and nowhere else. The zone comes from the settings and
 * is never assumed: Lima has no daylight saving today, but the arithmetic below
 * asks the zone for its offset at each instant instead of fixing −5.
 */

export const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
/** More days than any queue of this workshop can span: only a broken window gets here. */
const MAX_DAYS_SEARCHED = 3660;

/** A calendar day in the workshop's zone. */
interface LocalDay {
  year: number;
  month: number;
  day: number;
}

/** Parses an ISO instant, refusing garbage instead of planning around NaN. */
export function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new RangeError(`"${iso}" is not an ISO instant`);
  }
  return ms;
}

export function formatInstant(ms: number): string {
  return new Date(ms).toISOString();
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // h23, not hour12: false, which prints midnight as "24" in some engines.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Local wall clock minus UTC at that instant, in milliseconds. Lima gives −5 h. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  const wholeSeconds = instant - (((instant % MS_PER_SECOND) + MS_PER_SECOND) % MS_PER_SECOND);
  return wallClockAsUtc - wholeSeconds;
}

function nextDay(day: LocalDay): LocalDay {
  const next = new Date(Date.UTC(day.year, day.month - 1, day.day + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function parseDay(day: string): LocalDay {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    throw new RangeError(`"${day}" is not a YYYY-MM-DD day`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Where a plate lands in the window. `fits` is false for one longer than the whole day. */
export interface PlateSlot {
  start: number;
  fits: boolean;
}

/** The window of one workshop, ready to place plates and hand work in it. */
export interface WorkshopClock {
  /** The first instant at or after `from` where a plate of `durationMs` may start. */
  plateStart(from: number, durationMs: number): PlateSlot;
  /** When `durationMs` of hand work started no earlier than `from` ends. It may span days. */
  handWorkEnd(from: number, durationMs: number): number;
  /** The midnight after a local day: a promise for that day is kept until then. */
  endOfDay(day: string): number;
}

export function workshopClock(timeZone: string, window: PrintWindow): WorkshopClock {
  const localOf = (instant: number): { day: LocalDay; minute: MinuteOfDay } => {
    const wallClock = instant + zoneOffset(instant, timeZone);
    const midnight = wallClock - (((wallClock % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY);
    const date = new Date(midnight);
    return {
      day: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
      minute: (wallClock - midnight) / MS_PER_MINUTE,
    };
  };

  // The offset is read twice: once near the wall clock and once at the
  // candidate, so a day that changes offset still lands on the right instant.
  const instantAt = (day: LocalDay, minute: MinuteOfDay): number => {
    const wallClock = Date.UTC(day.year, day.month - 1, day.day) + minute * MS_PER_MINUTE;
    const guess = wallClock - zoneOffset(wallClock, timeZone);
    return wallClock - zoneOffset(guess, timeZone);
  };

  const { firstStart, lastStart, endBy } = window;

  const plateStart = (from: number, durationMs: number): PlateSlot => {
    const latestStart = Math.min(lastStart, endBy - durationMs / MS_PER_MINUTE);
    const { day, minute } = localOf(from);
    if (latestStart < firstStart) {
      // It never fits: start it at the first opening anyway, and let the
      // caller warn. Refusing to plan would hide the order from everyone.
      const startDay = minute <= firstStart ? day : nextDay(day);
      return { start: instantAt(startDay, firstStart), fits: false };
    }
    if (minute < firstStart) return { start: instantAt(day, firstStart), fits: true };
    if (minute <= latestStart) return { start: from, fits: true };
    return { start: instantAt(nextDay(day), firstStart), fits: true };
  };

  const handWorkEnd = (from: number, durationMs: number): number => {
    if (durationMs <= 0) return from;
    if (endBy <= firstStart) return from + durationMs;
    let remaining = durationMs;
    let cursor = from;
    for (let days = 0; days < MAX_DAYS_SEARCHED; days++) {
      const { day, minute } = localOf(cursor);
      if (minute >= endBy) {
        cursor = instantAt(nextDay(day), firstStart);
        continue;
      }
      if (minute < firstStart) cursor = instantAt(day, firstStart);
      const available = instantAt(day, endBy) - cursor;
      if (remaining <= available) return cursor + remaining;
      remaining -= available;
      cursor = instantAt(nextDay(day), firstStart);
    }
    return cursor + remaining;
  };

  const endOfDay = (day: string): number => instantAt(nextDay(parseDay(day)), 0);

  return { plateStart, handWorkEnd, endOfDay };
}

/** "06:00" for 360: how the window reads in a warning. */
export function formatMinuteOfDay(minute: MinuteOfDay): string {
  const hours = Math.floor(minute / 60);
  const minutes = Math.round(minute % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
