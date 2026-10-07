import { rowsForPlate, suggestSpool, type SpoolChoice } from './produccion.spools';

const spool = (id: string, status: SpoolChoice['status'], onHandG: number, skuId = 'black'): SpoolChoice => ({
  id,
  skuId,
  status,
  onHandG,
});

describe('suggestSpool', () => {
  it('proposes the roll on the printer before an open one, and an open one before a sealed kilo', () => {
    const spools = [spool('sealed', 'sealed', 1000), spool('open', 'open', 300), spool('ams', 'in_use', 200)];
    expect(suggestSpool(spools, 'black', 20)).toBe('ams');
    expect(suggestSpool(spools.slice(0, 2), 'black', 20)).toBe('open');
  });

  it('among open rolls, finishes the one that is enough and has less', () => {
    const spools = [spool('big', 'open', 800), spool('small', 'open', 60), spool('tiny', 'open', 10)];
    expect(suggestSpool(spools, 'black', 50)).toBe('small');
  });

  it('when none is enough, takes the fullest', () => {
    const spools = [spool('a', 'open', 30), spool('b', 'open', 45)];
    expect(suggestSpool(spools, 'black', 50)).toBe('b');
  });

  it('never proposes a roll of another filament, nor one already chosen', () => {
    const spools = [spool('pink', 'in_use', 900, 'pink'), spool('black', 'open', 300)];
    expect(suggestSpool(spools, 'black', 20)).toBe('black');
    expect(suggestSpool(spools, 'black', 20, new Set(['black']))).toBe('');
    expect(suggestSpool(spools, null, 20)).toBe('');
  });
});

describe('rowsForPlate', () => {
  it('adds up two slots of the same filament into one row, in slot order', () => {
    expect(
      rowsForPlate([
        { slot: 3, skuId: 'black', grams: 4.5 },
        { slot: 1, skuId: 'pink', grams: 10 },
        { slot: 2, skuId: 'black', grams: 1.25 },
      ]),
    ).toEqual([
      { slot: 1, skuId: 'pink', grams: 10 },
      { slot: 2, skuId: 'black', grams: 5.75 },
    ]);
  });
});
