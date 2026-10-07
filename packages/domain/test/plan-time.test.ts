import { describe, expect, it } from 'vitest';
import { MS_PER_MINUTE, parseInstant, workshopClock } from '../src/plan-time.ts';
import { PrintQueue, formatDuration } from '../src/plan-queue.ts';
import { lima, wallClock } from './plan-fixtures.ts';

const WINDOW = { firstStart: 6 * 60, lastStart: 23 * 60, endBy: 24 * 60 };
const clock = workshopClock('America/Lima', WINDOW);
const minutes = (n: number) => n * MS_PER_MINUTE;
const at = (local: string) => parseInstant(lima(local));
const show = (ms: number) => wallClock(new Date(ms).toISOString());

describe('workshopClock.plateStart', () => {
  it('starts right away inside the window', () => {
    expect(show(clock.plateStart(at('2026-10-06 18:00'), minutes(43)).start)).toBe('mar 18:00');
  });

  it('waits for 6:00 before the window opens', () => {
    expect(show(clock.plateStart(at('2026-10-06 02:30'), minutes(43)).start)).toBe('mar 06:00');
  });

  it('a 43-minute plate may start until 23:00; one minute later it goes to the next morning', () => {
    expect(show(clock.plateStart(at('2026-10-06 23:00'), minutes(43)).start)).toBe('mar 23:00');
    expect(show(clock.plateStart(at('2026-10-06 23:01'), minutes(43)).start)).toBe('mié 06:00');
  });

  it('a long plate is held back by midnight, not by the last start', () => {
    // min(23:00, 24:00 − 3 h) = 21:00
    expect(show(clock.plateStart(at('2026-10-06 21:00'), minutes(180)).start)).toBe('mar 21:00');
    expect(show(clock.plateStart(at('2026-10-06 21:01'), minutes(180)).start)).toBe('mié 06:00');
  });

  it('a plate longer than the day says it does not fit and takes the next opening', () => {
    expect(clock.plateStart(at('2026-10-06 18:00'), minutes(19 * 60))).toEqual({
      start: at('2026-10-07 06:00'),
      fits: false,
    });
    expect(clock.plateStart(at('2026-10-06 05:00'), minutes(19 * 60))).toEqual({
      start: at('2026-10-06 06:00'),
      fits: false,
    });
  });
});

describe('workshopClock.handWorkEnd', () => {
  it('works straight through inside the day', () => {
    expect(show(clock.handWorkEnd(at('2026-10-06 22:12'), minutes(40)))).toBe('mar 22:52');
  });

  it('stops at midnight and carries on at 6:00', () => {
    expect(show(clock.handWorkEnd(at('2026-10-06 23:30'), minutes(50)))).toBe('mié 06:20');
  });

  it('waits for 6:00 when it is ready at night', () => {
    expect(show(clock.handWorkEnd(at('2026-10-07 01:00'), minutes(30)))).toBe('mié 06:30');
  });

  it('with nothing to do is ready when the parts are', () => {
    expect(clock.handWorkEnd(at('2026-10-07 01:00'), 0)).toBe(at('2026-10-07 01:00'));
  });
});

describe('workshopClock.endOfDay', () => {
  it('a day in Lima ends at its midnight, 05:00 UTC of the next day', () => {
    expect(new Date(clock.endOfDay('2026-10-06')).toISOString()).toBe('2026-10-07T05:00:00.000Z');
  });
});

describe('workshopClock in a zone with daylight saving', () => {
  // Madrid leaves summer time on Sunday 25 October 2026: 6:00 is 04:00 UTC
  // on Saturday and 05:00 UTC on Monday. A fixed offset would get one wrong.
  const madrid = workshopClock('Europe/Madrid', WINDOW);

  it('places 6:00 at the right instant on both sides of the change', () => {
    const saturdayNight = parseInstant('2026-10-24T22:00:00.000Z'); // 00:00 local
    const mondayNight = parseInstant('2026-10-26T23:00:00.000Z'); // 00:00 local
    expect(new Date(madrid.plateStart(saturdayNight, minutes(30)).start).toISOString()).toBe(
      '2026-10-25T05:00:00.000Z',
    );
    expect(new Date(madrid.plateStart(mondayNight, minutes(30)).start).toISOString()).toBe(
      '2026-10-27T05:00:00.000Z',
    );
    expect(new Date(madrid.endOfDay('2026-10-24')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });
});

describe('PrintQueue.sparesFor', () => {
  it('one spare per ten runs or fraction, without float surprises', () => {
    expect(PrintQueue.sparesFor(4, 0.1)).toBe(1);
    expect(PrintQueue.sparesFor(10, 0.1)).toBe(1);
    expect(PrintQueue.sparesFor(11, 0.1)).toBe(2);
    expect(PrintQueue.sparesFor(30, 0.1)).toBe(3);
    expect(PrintQueue.sparesFor(4, 0)).toBe(0);
    expect(PrintQueue.sparesFor(0, 0.1)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('reads like a person writes it', () => {
    expect(formatDuration(minutes(19 * 60))).toBe('19 h');
    expect(formatDuration(minutes(200))).toBe('3 h 20 min');
    expect(formatDuration(minutes(45))).toBe('45 min');
  });
});
