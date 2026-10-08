import { closeProposal } from './close-proposal';

/** The test print of the third pass: 1000 h estimated, 2 kg of white PLA. */
const HOURS_1000 = 1000 * 3600;

describe('closeProposal', () => {
  it('proposes the estimate for a print that finished', () => {
    expect(closeProposal('success', 1334, [12.5, 3], null)).toEqual({
      time: { seconds: 1334, minutes: 22 },
      grams: [12.5, 3],
    });
  });

  it('proposes nothing for a failed print until it says how far it got (T3-05)', () => {
    expect(closeProposal('failed', HOURS_1000, [2000], null)).toEqual({ time: null, grams: [null] });
    expect(closeProposal('cancelled', HOURS_1000, [2000], null)).toEqual({ time: null, grams: [null] });
  });

  it('proposes the share the percentage says it got to', () => {
    expect(closeProposal('failed', 1200, [95.91, 10], 15)).toEqual({
      time: { seconds: 180, minutes: 3 },
      grams: [14.39, 1.5],
    });
  });

  it('proposes no time for a print that stopped at zero, and no grams spent', () => {
    expect(closeProposal('cancelled', 1200, [95.91], 0)).toEqual({ time: null, grams: [0] });
  });

  it('ignores a percentage out of range', () => {
    expect(closeProposal('failed', 1200, [10], 150)).toEqual({ time: null, grams: [null] });
  });

  it('a job without an estimate proposes no time, only grams', () => {
    expect(closeProposal('failed', null, [10], 50)).toEqual({ time: null, grams: [5] });
  });
});
