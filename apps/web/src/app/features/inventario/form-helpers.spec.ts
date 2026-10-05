import { blankToNull, inactiveSuffix, selectableOptions } from './form-helpers';

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
