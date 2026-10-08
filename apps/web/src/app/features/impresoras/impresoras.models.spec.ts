import { describe, expect, it } from 'vitest';
import { printedSeconds, type JobRun } from './impresoras.models';

const STARTED = '2026-10-07T20:00:00Z';

function job(overrides: Partial<JobRun>): JobRun {
  return { status: 'success', startedAt: STARTED, actualTimeS: 1334, ...overrides };
}

describe('printedSeconds', () => {
  it('counts a successful print', () => {
    expect(printedSeconds(job({}))).toBe(1334);
  });

  it('counts a failed print too: it wore the machine and paid its hour', () => {
    expect(printedSeconds(job({ status: 'failed', actualTimeS: 780 }))).toBe(780);
  });

  it('counts what a started job ran before it was cancelled', () => {
    expect(printedSeconds(job({ status: 'cancelled', actualTimeS: 600 }))).toBe(600);
  });

  it('counts nothing for a job cancelled before it started, even with a time saved on it', () => {
    expect(printedSeconds(job({ status: 'cancelled', startedAt: null, actualTimeS: 1200 }))).toBe(0);
  });

  it('counts nothing until the job closes', () => {
    expect(printedSeconds(job({ status: 'planned', startedAt: null, actualTimeS: null }))).toBe(0);
    expect(printedSeconds(job({ status: 'printing', actualTimeS: null }))).toBe(0);
  });

  it('adds up the hours of the skull: three good prints, two failed', () => {
    const seconds = [
      job({ actualTimeS: 1997 }),
      job({ actualTimeS: 1334 }),
      job({ status: 'failed', actualTimeS: 780 }),
      job({ status: 'failed', actualTimeS: 360 }),
      job({ status: 'cancelled', startedAt: null, actualTimeS: 1200 }),
    ].reduce((sum, run) => sum + printedSeconds(run), 0);

    expect(seconds).toBe(1997 + 1334 + 780 + 360);
  });
});
