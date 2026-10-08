import { describe, expect, it } from 'vitest';
import { commonCauses, joinLabels } from './panel.prints';

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
