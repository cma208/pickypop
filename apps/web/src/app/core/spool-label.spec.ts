import { spoolLabel, spoolName } from './spool-label';

describe('spoolName', () => {
  it('puts the material before the colour, so a PETG black is not a second PLA black', () => {
    expect(spoolName({ code: 'NEGRO-02', materialCode: 'PETG', colorName: 'Negro' })).toBe('NEGRO-02 · PETG Negro');
  });

  it('still names a roll whose filament has no material', () => {
    expect(spoolName({ code: 'NEGRO-01', colorName: 'Negro' })).toBe('NEGRO-01 · Negro');
    expect(spoolName({ code: 'NEGRO-01', materialCode: '  ', colorName: 'Negro' })).toBe('NEGRO-01 · Negro');
  });

  it('says so when the roll has no code', () => {
    expect(spoolName({ code: null, materialCode: 'PLA', colorName: 'Blanco' })).toBe('Sin código · PLA Blanco');
    expect(spoolName({ code: '', materialCode: 'PLA', colorName: 'Blanco' })).toBe('Sin código · PLA Blanco');
  });
});

describe('spoolLabel', () => {
  it('adds what is left on the roll', () => {
    expect(spoolLabel({ code: 'NEGRO-02', materialCode: 'PETG', colorName: 'Negro' }, 904)).toBe(
      'NEGRO-02 · PETG Negro · 904 g',
    );
  });

  it('shows a full kilo as kilos, like every other list', () => {
    expect(spoolLabel({ code: 'BLANCO-01', materialCode: 'PLA', colorName: 'Blanco' }, 1000)).toBe(
      'BLANCO-01 · PLA Blanco · 1 kg',
    );
  });

  it('shows a roll that is at zero, which is information too', () => {
    expect(spoolLabel({ code: 'ROJO-01', materialCode: 'PLA', colorName: 'Rojo' }, 0)).toBe('ROJO-01 · PLA Rojo · 0 g');
  });

  it('leaves the grams out when they are not known', () => {
    expect(spoolLabel({ code: 'ROJO-01', materialCode: 'PLA', colorName: 'Rojo' })).toBe('ROJO-01 · PLA Rojo');
    expect(spoolLabel({ code: 'ROJO-01', materialCode: 'PLA', colorName: 'Rojo' }, null)).toBe('ROJO-01 · PLA Rojo');
  });
});
