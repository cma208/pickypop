import { describe, expect, it } from 'vitest';
import { printedSeconds, type JobRun } from './impresoras.models';

function job(overrides: Partial<JobRun>): JobRun {
  return { status: 'success', actualTimeS: 1334, ...overrides };
}

describe('printedSeconds', () => {
  it('counts a successful print', () => {
    expect(printedSeconds(job({}))).toBe(1334);
  });

  it('counts a failed print too: it wore the machine and paid its hour', () => {
    expect(printedSeconds(job({ status: 'failed', actualTimeS: 780 }))).toBe(780);
  });

  it('counts what a cancelled print ran, whether or not someone pressed «Iniciar»', () => {
    expect(printedSeconds(job({ status: 'cancelled', actualTimeS: 600 }))).toBe(600);
  });

  it('counts nothing for a cancelled job without a time: it never ran', () => {
    expect(printedSeconds(job({ status: 'cancelled', actualTimeS: null }))).toBe(0);
  });

  it('counts nothing until the job closes', () => {
    expect(printedSeconds(job({ status: 'planned', actualTimeS: null }))).toBe(0);
    expect(printedSeconds(job({ status: 'printing', actualTimeS: 900 }))).toBe(0);
  });

  it('adds up the hours of the skull: three good prints, two failed, one that never ran', () => {
    const seconds = [
      job({ actualTimeS: 1997 }),
      job({ actualTimeS: 1334 }),
      job({ status: 'failed', actualTimeS: 780 }),
      job({ status: 'failed', actualTimeS: 360 }),
      // The keychain cancelled before it started: the migration took its copied estimate away.
      job({ status: 'cancelled', actualTimeS: null }),
    ].reduce((sum, run) => sum + printedSeconds(run), 0);

    expect(seconds).toBe(1997 + 1334 + 780 + 360);
  });
});
