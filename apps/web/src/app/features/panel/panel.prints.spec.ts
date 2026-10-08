import { describe, expect, it } from 'vitest';
import { commonCauses, joinCauses } from './panel.prints';

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

describe('joinCauses', () => {
  it('reads like a sentence', () => {
    expect(joinCauses(['warping'])).toBe('warping');
    expect(joinCauses(['adhesión a la placa', 'warping'])).toBe('adhesión a la placa y warping');
    expect(joinCauses(['a', 'b', 'c'])).toBe('a, b y c');
    expect(joinCauses([])).toBe('');
  });
});
