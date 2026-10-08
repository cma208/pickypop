import { describe, expect, it } from 'vitest';
import { chargedSeconds, proposeTime, realCostOf, secondsToSave, type SavedCost } from './job-time';

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
  const job = { estimatedTimeS: 1200 };

  it('charges nothing for a cancelled job without a time: it did not run', () => {
    expect(chargedSeconds(job, 'cancelled', null)).toBeNull();
  });

  it('charges what a cancelled job ran, never its estimate', () => {
    expect(chargedSeconds(job, 'cancelled', 600)).toBe(600);
  });

  it('charges the real time of a finished job, and its estimate only without one', () => {
    expect(chargedSeconds(job, 'success', 1334)).toBe(1334);
    expect(chargedSeconds(job, 'failed', 780)).toBe(780);
    expect(chargedSeconds(job, 'success', null)).toBe(1200);
    expect(chargedSeconds({ estimatedTimeS: null }, 'failed', null)).toBe(0);
  });
});

describe('realCostOf', () => {
  const closed: SavedCost = { status: 'success', actualTimeS: 1334, materialCost: 0.31, energyCost: 0.02, machineCost: 0.16 };

  it('adds up the three costs to the cent', () => {
    expect(realCostOf(closed)).toBe(0.49);
  });

  it('has none to show when nothing was saved', () => {
    expect(realCostOf({ ...closed, materialCost: null, energyCost: null, machineCost: null })).toBeNull();
  });

  it('shows none for a cancelled job without a time, empty or at zero', () => {
    const fromQueue = { status: 'cancelled', actualTimeS: null, materialCost: null, energyCost: null, machineCost: null };
    const withItsOrder = { status: 'cancelled', actualTimeS: null, materialCost: 0, energyCost: 0, machineCost: 0 };
    expect(realCostOf(fromQueue)).toBeNull();
    expect(realCostOf(withItsOrder)).toBeNull();
  });

  it('shows what a cancelled job cost for the time it ran', () => {
    // Launched without «Iniciar» and stopped after 10 minutes.
    expect(realCostOf({ status: 'cancelled', actualTimeS: 600, materialCost: 0, energyCost: 0.01, machineCost: 0.07 })).toBe(0.08);
  });
});
