import { describe, expect, it } from 'vitest';
import { jobProgress } from './produccion.progress';

const START = '2026-10-06T08:00:00Z';
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000);

describe('jobProgress', () => {
  it('says nothing about a job that has not started', () => {
    expect(jobProgress(null, 3600)).toBeNull();
  });

  it('measures against the estimate', () => {
    const progress = jobProgress(START, 3600, at(30))!;
    expect(progress.fraction).toBeCloseTo(0.5);
    expect(progress.remainingS).toBe(1800);
    expect(progress.overdue).toBe(false);
  });

  it('still counts the time when there is no estimate', () => {
    const progress = jobProgress(START, null, at(20))!;
    expect(progress.fraction).toBeNull();
    expect(progress.elapsedS).toBe(1200);
  });

  it('caps the bar but says it is running long', () => {
    // A bar past its end reads as a bug; the wording is what carries the news.
    const progress = jobProgress(START, 3600, at(90))!;
    expect(progress.fraction).toBe(1);
    expect(progress.remainingS).toBe(-1800);
    expect(progress.overdue).toBe(true);
  });

  it('does not go backwards when the clocks disagree', () => {
    expect(jobProgress(START, 3600, at(-5))!.elapsedS).toBe(0);
  });
});
