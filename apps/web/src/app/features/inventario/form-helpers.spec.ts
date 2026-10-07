import { blankToNull, inactiveSuffix, photosToDelete, selectableOptions } from './form-helpers';

describe('photosToDelete', () => {
  it('on cancel deletes only what was uploaded, never the photo the article still has', () => {
    expect(photosToDelete(['new-1.webp', 'new-2.webp'], 'old.webp', 'new-2.webp', false)).toEqual([
      'new-1.webp',
      'new-2.webp',
    ]);
  });

  it('on save keeps the chosen photo and deletes the replaced one and the discarded tries', () => {
    expect(photosToDelete(['new-1.webp', 'new-2.webp'], 'old.webp', 'new-2.webp', true)).toEqual([
      'new-1.webp',
      'old.webp',
    ]);
  });

  it('on save after removing the photo deletes the old one', () => {
    expect(photosToDelete([], 'old.webp', null, true)).toEqual(['old.webp']);
  });

  it('has nothing to delete when nothing changed', () => {
    expect(photosToDelete([], 'old.webp', 'old.webp', true)).toEqual([]);
    expect(photosToDelete([], null, null, false)).toEqual([]);
  });
});

describe('selectableOptions', () => {
  const options = [
    { id: 'a', active: true },
    { id: 'b', active: false },
    { id: 'c', active: true },
  ];

  it('offers only the active entries when creating', () => {
    expect(selectableOptions(options, null).map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('keeps the deactivated entry the record being edited already uses', () => {
    expect(selectableOptions(options, 'b').map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not bring back other deactivated entries', () => {
    expect(selectableOptions(options, 'a').map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('copes with a current id that is not in the list', () => {
    expect(selectableOptions(options, 'zzz').map((o) => o.id)).toEqual(['a', 'c']);
  });
});

describe('inactiveSuffix', () => {
  it('only marks the deactivated ones', () => {
    expect(inactiveSuffix({ active: true })).toBe('');
    expect(inactiveSuffix({ active: false })).toBe(' (ya no se ofrece)');
  });
});

describe('blankToNull', () => {
  it('turns blank text into null and trims the rest', () => {
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull(' Seda ')).toBe('Seda');
  });
});
