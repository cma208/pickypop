import { describe, expect, it } from 'vitest';
import type { CostProfileRecord } from './configuracion.models';
import { pickCurrent, profileState } from './cost-profile-lines';

const version = (id: string, validFrom: string): CostProfileRecord => ({
  id,
  validFrom,
  materialWasteRate: 0.03,
  failureRate: 0.1,
  laborRatePerHour: 15,
  energyRatePerKwh: 0.7556,
  targetMargin: 0.5,
  minOrderPrice: 5,
  roundingStep: 0.5,
  igvRate: 0.18,
  materialValuation: 'weighted_avg',
  note: null,
});

describe('profileState', () => {
  const old = version('old', '2026-09-01');
  const inForce = version('in-force', '2026-10-01');
  const tomorrow = version('tomorrow', '2026-10-09');
  const profiles = [tomorrow, inForce, old];
  const today = '2026-10-08';
  const current = pickCurrent(profiles, today);

  it('only lets a version that has not started be corrected or taken back', () => {
    expect(profileState(tomorrow, current, today)).toBe('scheduled');
    expect(profileState(inForce, current, today)).toBe('current');
    expect(profileState(old, current, today)).toBe('past');
  });

  it('counts a version that starts today as in force, not scheduled', () => {
    const startsToday = version('today', today);
    const withToday = [...profiles, startsToday];
    expect(profileState(startsToday, pickCurrent(withToday, today), today)).toBe('current');
  });
});
