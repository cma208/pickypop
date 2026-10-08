import { supplyQuantityText, unitsText } from './quantity-text';

describe('unitsText', () => {
  it('reads «1 unidad» and not «1 unidades»', () => {
    expect(unitsText(1)).toBe('1 unidad');
    expect(unitsText(2)).toBe('2 unidades');
    expect(unitsText(30)).toBe('30 unidades');
  });
});

describe('supplyQuantityText', () => {
  it('says the unit of the stock item, as the saved quote of the calavera needed', () => {
    expect(supplyQuantityText(50, 'g')).toBe('50 g');
    expect(supplyQuantityText(12.5, 'ml')).toBe('12.5 ml');
  });

  it('makes only the app’s own word plural', () => {
    expect(supplyQuantityText(1, 'unidad')).toBe('1 unidad');
    expect(supplyQuantityText(3, 'unidad')).toBe('3 unidades');
    expect(supplyQuantityText(2, 'par')).toBe('2 par');
  });

  it('gives the bare number for a supply typed by hand', () => {
    expect(supplyQuantityText(4, null)).toBe('4');
    expect(supplyQuantityText(0.125, undefined)).toBe('0.125');
  });
});
