import { describe, expect, it } from 'vitest';
import { chargedSeconds, neverRan, proposeTime, secondsToSave } from './job-time';

describe('proposeTime', () => {
  it('rounds the plate to whole minutes and keeps its seconds', () => {
    expect(proposeTime(1334)).toEqual({ seconds: 1334, minutes: 22 });
    expect(proposeTime(1997)).toEqual({ seconds: 1997, minutes: 33 });
  });

  it('never proposes zero minutes', () => {
    expect(proposeTime(20)).toEqual({ seconds: 20, minutes: 1 });
  });

  it('proposes nothing without a time', () => {
    expect(proposeTime(null)).toBeNull();
    expect(proposeTime(undefined)).toBeNull();
    expect(proposeTime(0)).toBeNull();
  });
});

describe('secondsToSave', () => {
  const backOfSkull = proposeTime(1334);

  it('saves the exact seconds while the proposed minutes are left alone', () => {
    // 1334 s: machine 1334 / 3600 × 0.42 = 0.1556 → 0.16, as the quote said.
    expect(secondsToSave(22, backOfSkull)).toBe(1334);
  });

  it('converts the minutes the person changed', () => {
    expect(secondsToSave(13, backOfSkull)).toBe(780);
    expect(secondsToSave(25, backOfSkull)).toBe(1500);
  });

  it('converts the minutes when nothing was proposed', () => {
    expect(secondsToSave(20, null)).toBe(1200);
  });

  it('saves no time for an empty field', () => {
    expect(secondsToSave(null, backOfSkull)).toBeNull();
    expect(secondsToSave(0, backOfSkull)).toBeNull();
  });
});

describe('chargedSeconds', () => {
  const planned = { startedAt: null, estimatedTimeS: 1200 };
  const printing = { startedAt: '2026-10-07T20:00:00Z', estimatedTimeS: 1200 };

  it('charges nothing for a job cancelled before it started', () => {
    expect(neverRan(planned.startedAt, 'cancelled')).toBe(true);
    expect(chargedSeconds(planned, 'cancelled', null)).toBeNull();
    // Not even if a time came along: it did not run.
    expect(chargedSeconds(planned, 'cancelled', 1200)).toBeNull();
  });

  it('charges what a started job ran before it was cancelled, never its estimate', () => {
    expect(neverRan(printing.startedAt, 'cancelled')).toBe(false);
    expect(chargedSeconds(printing, 'cancelled', 600)).toBe(600);
    expect(chargedSeconds(printing, 'cancelled', null)).toBe(0);
  });

  it('charges the real time of a finished job, and its estimate only without one', () => {
    expect(chargedSeconds(printing, 'success', 1334)).toBe(1334);
    expect(chargedSeconds(printing, 'failed', 780)).toBe(780);
    expect(chargedSeconds(printing, 'success', null)).toBe(1200);
  });

  it('charges a job printed without pressing «Iniciar» like any other', () => {
    expect(neverRan(planned.startedAt, 'success')).toBe(false);
    expect(chargedSeconds(planned, 'success', 900)).toBe(900);
  });
});
