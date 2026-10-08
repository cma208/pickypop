import { describe, expect, it } from 'vitest';
import { commonCauses, failedLabel, joinLabels, weekAttempts } from './panel.prints';

describe('weekAttempts', () => {
  it('counts a cancelled print that ran as a failed attempt, as Resultados and failure_stats do', () => {
    const week = weekAttempts([
      { status: 'success', actual_time_s: 3600 },
      { status: 'failed', actual_time_s: 600 },
      { status: 'cancelled', actual_time_s: 1800 },
    ]);

    expect(week).toEqual({ successful: 1, failed: 2, cancelledRan: 1 });
  });

  it('leaves out a print cancelled before it ran: it cost nothing and was never tried', () => {
    expect(weekAttempts([{ status: 'cancelled', actual_time_s: null }])).toEqual({
      successful: 0,
      failed: 0,
      cancelledRan: 0,
    });
  });
});

describe('failedLabel', () => {
  it('says how many of the failed were cancelled halfway', () => {
    expect(failedLabel(0)).toBe('fallidas');
    expect(failedLabel(1)).toBe('fallidas (1 cancelada a medias)');
    expect(failedLabel(3)).toBe('fallidas (3 canceladas a medias)');
  });
});

describe('commonCauses', () => {
  it('names the cause that stands out', () => {
    expect(commonCauses(['warping', 'adhesion', 'warping'])).toEqual(['warping']);
  });

  it('names every cause of a tie instead of picking one by its name', () => {
    // The skull: one warping in E3, one adhesion in E4.
    expect(commonCauses(['adhesion', 'warping'])).toEqual(['adhesion', 'warping']);
  });

  it('has nothing to say without failures', () => {
    expect(commonCauses([])).toEqual([]);
    expect(commonCauses([null])).toEqual([]);
  });
});

describe('joinLabels', () => {
  it('reads like a sentence', () => {
    expect(joinLabels(['warping'])).toBe('warping');
    expect(joinLabels(['adhesión a la placa', 'warping'])).toBe('adhesión a la placa y warping');
    expect(joinLabels(['a', 'b', 'c'])).toBe('a, b y c');
    expect(joinLabels([])).toBe('');
  });
});
