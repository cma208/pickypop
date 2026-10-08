import { describe, expect, it } from 'vitest';
import { partsOnlyThisPlateMakes, removePlateQuestion } from './plate-removal';

const plate = (id: string, ...parts: string[]) => ({
  id,
  outputs: parts.map((part, index) => ({ id: `${id}-${index}`, inventoryItemId: part, unitsPerRun: 1 })),
});

describe('partsOnlyThisPlateMakes', () => {
  it('names what no other plate of the recipe prints', () => {
    const caps = plate('p1', 'cap', 'hook');
    const back = plate('p3', 'back');
    const spareCaps = plate('p4', 'cap');

    expect(partsOnlyThisPlateMakes(back, [caps, back, spareCaps])).toEqual(['back']);
    expect(partsOnlyThisPlateMakes(caps, [caps, back, spareCaps])).toEqual(['hook']);
    expect(partsOnlyThisPlateMakes(spareCaps, [caps, back, spareCaps])).toEqual([]);
  });
});

describe('removePlateQuestion (T2-07)', () => {
  it('asks only about the plate when the other plates still print everything', () => {
    expect(removePlateQuestion({ plateIndex: 4, label: 'Tapas' }, [])).toBe('¿Quitar la placa 4 (Tapas) y sus filamentos?');
  });

  it('says which part is left with nothing to print it, and what that does to the cost and the plan', () => {
    const question = removePlateQuestion({ plateIndex: 3, label: 'SkullV4' }, ['Trasera de calavera']);

    expect(question).toContain('¿Quitar la placa 3 (SkullV4) y sus filamentos?');
    expect(question).toContain('Es la única placa de la receta que imprime «Trasera de calavera».');
    expect(question).toContain('su costo ya no sale de las corridas de esta receta');
    expect(question).toContain('quítala también de «Piezas impresas por unidad»');
    expect(question).not.toContain('otra receta la');
  });

  it('speaks in plural of several parts', () => {
    expect(removePlateQuestion({ plateIndex: 1, label: null }, ['Tapa', 'Gancho'])).toContain(
      'imprime «Tapa» y «Gancho». La receta las sigue pidiendo',
    );
  });
});
