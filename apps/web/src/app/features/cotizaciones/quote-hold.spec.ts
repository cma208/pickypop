import { acceptPlace, holdState, holdUntilProblem } from './quote-hold';

// Tuesday 6 October 2026, 15:00 in Lima (UTC-5).
const NOW = new Date('2026-10-06T20:00:00Z');
// Wednesday 7 October, 23:00 in Lima: the default end of a hold made today.
const TOMORROW_23 = '2026-10-08T04:00:00+00:00';
// Monday 5 October, 18:00 in Lima.
const MONDAY_18 = '2026-10-05T23:00:00+00:00';

describe('holdState', () => {
  it('holds until a moment that has not come yet', () => {
    expect(holdState(TOMORROW_23, NOW)).toEqual({ kind: 'active', until: TOMORROW_23 });
  });

  it('holds nothing once the moment went by, without anybody writing it', () => {
    expect(holdState(MONDAY_18, NOW)).toEqual({ kind: 'expired', until: MONDAY_18 });
  });

  it('holds nothing at the very moment it ends: the database asks for later than now', () => {
    expect(holdState(NOW.toISOString(), NOW).kind).toBe('expired');
  });

  it('never held when there is no end at all', () => {
    expect(holdState(null, NOW)).toEqual({ kind: 'none' });
  });
});

describe('acceptPlace', () => {
  it('keeps the place of a hold still running, said as a day and an hour', () => {
    expect(acceptPlace(MONDAY_18, TOMORROW_23, NOW)).toEqual({
      keeps: true,
      text: 'Conserva su lugar en la fila: separó el lunes 5 de octubre, 18:00.',
    });
  });

  it('sends an expired hold to the end of the line, saying when it expired', () => {
    expect(acceptPlace(MONDAY_18, MONDAY_18, NOW)).toEqual({
      keeps: false,
      text: 'El separo venció el lunes 5 de octubre, 18:00: entra a la fila ahora, después de los pedidos que ya están.',
    });
  });

  it('sends a quote that never held to the end of the line', () => {
    const place = acceptPlace(null, null, NOW);
    expect(place.keeps).toBe(false);
    expect(place.text).toContain('No separó nada');
  });

  it('does not keep a place it never took, even with an end in the future', () => {
    expect(acceptPlace(null, TOMORROW_23, NOW).keeps).toBe(false);
  });
});

describe('holdUntilProblem', () => {
  it('accepts a moment later than now, read in Lima time', () => {
    expect(holdUntilProblem('2026-10-07T23:00', NOW)).toBeNull();
  });

  it('refuses a moment already gone: letting go has its own button', () => {
    // 14:00 in Lima is an hour ago, even though 14:00 UTC would also be past.
    expect(holdUntilProblem('2026-10-06T14:00', NOW)).toBe('Esa hora ya pasó. Elige una más adelante.');
  });

  it('reads the hour as Lima, not UTC: 16:00 today is still ahead', () => {
    expect(holdUntilProblem('2026-10-06T16:00', NOW)).toBeNull();
  });

  it('asks for both the day and the hour', () => {
    expect(holdUntilProblem('', NOW)).toBe('Elige el día y la hora.');
    expect(holdUntilProblem('2026-10-07', NOW)).toBe('Elige el día y la hora.');
  });
});
