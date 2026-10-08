import { buildableFrom, MAX_UNITS, parseUnits, unitsProblem } from './armar-units';

describe('«¿Cuántas?» in Armar (T3-15)', () => {
  it('takes whole numbers from one', () => {
    expect(parseUnits('3')).toBe(3);
    expect(parseUnits(' 12 ')).toBe(12);
  });

  it('refuses what the field used to turn into another number in silence', () => {
    for (const typed of ['0', '1.5', '2.9', '1e3', '-2', '', 'tres']) {
      expect(parseUnits(typed)).toBeNull();
      expect(unitsProblem(typed)).toBe(`Escribe un número entero de 1 a ${MAX_UNITS}.`);
    }
  });

  it('refuses more than a workshop assembles at once', () => {
    expect(parseUnits(String(MAX_UNITS))).toBe(MAX_UNITS);
    expect(parseUnits(String(MAX_UNITS + 1))).toBeNull();
  });
});

describe('buildableFrom (T3-16)', () => {
  it('is what the scarcest component reaches', () => {
    expect(
      buildableFrom([
        { quantityPerUnit: 1, onHand: 3 },
        { quantityPerUnit: 66, onHand: 520 },
        { quantityPerUnit: 1, onHand: 9 },
      ]),
    ).toBe(3);
  });

  it('does not lose a unit to float noise', () => {
    expect(buildableFrom([{ quantityPerUnit: 0.1, onHand: 0.3 }])).toBe(3);
  });

  it('is zero with nothing on the table, or with a component at zero', () => {
    expect(buildableFrom([])).toBe(0);
    expect(buildableFrom([{ quantityPerUnit: 2, onHand: 0 }])).toBe(0);
  });
});
