import { describe, expect, it } from 'vitest';
import {
  isOnlySourceOf,
  partsOnlyThisPlateMakes,
  removeOutputQuestion,
  removePlateQuestion,
  splitByRecipe,
  swapOutputQuestion,
} from './plate-removal';

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
  const none = { asked: [], notAsked: [] };

  it('asks only about the plate when the other plates still print everything', () => {
    expect(removePlateQuestion({ plateIndex: 4, label: 'Tapas' }, none)).toBe('¿Quitar la placa 4 (Tapas) y sus filamentos?');
  });

  it('says which part is left with nothing to print it, and what that does to the cost and the plan', () => {
    const question = removePlateQuestion({ plateIndex: 3, label: 'SkullV4' }, { asked: ['Trasera de calavera'], notAsked: [] });

    expect(question).toContain('¿Quitar la placa 3 (SkullV4) y sus filamentos?');
    expect(question).toContain('Es la única placa de la receta que imprime «Trasera de calavera».');
    expect(question).toContain('su costo ya no sale de las corridas de esta receta');
    expect(question).toContain('quítala también de «Piezas impresas por unidad»');
    expect(question).not.toContain('otra receta la');
  });

  it('speaks in plural of several parts', () => {
    expect(removePlateQuestion({ plateIndex: 1, label: null }, { asked: ['Tapa', 'Gancho'], notAsked: [] })).toContain(
      'imprime «Tapa» y «Gancho». La receta las sigue pidiendo',
    );
  });

  it('does not say the recipe asks for a part it does not take (the plate prints it for another product)', () => {
    const question = removePlateQuestion({ plateIndex: 1, label: null }, { asked: ['Tapa'], notAsked: ['Gancho'] });

    expect(question).toContain('Es la única placa de la receta que imprime «Tapa». La receta la sigue pidiendo');
    expect(question).toContain('También es la única que imprime «Gancho», que la receta no pide: ya no saldrá de sus corridas.');
    expect(question).not.toContain('«Tapa» y «Gancho»');
  });

  it('asks nothing about the cost or the recipe when only parts it does not take are left without a plate', () => {
    const question = removePlateQuestion({ plateIndex: 2, label: null }, { asked: [], notAsked: ['Gancho', 'Aro'] });

    expect(question).toContain('Es la única placa de la receta que imprime «Gancho» y «Aro», que la receta no pide: ya no saldrán');
    expect(question).not.toContain('sigue pidiendo');
    expect(question).not.toContain('Piezas impresas por unidad');
  });
});

describe('splitByRecipe', () => {
  it('tells the parts the recipe asks for from the ones it does not take', () => {
    expect(splitByRecipe(['cap', 'hook'], new Set(['cap', 'bag']))).toEqual({ asked: ['cap'], notAsked: ['hook'] });
  });
});

describe('isOnlySourceOf', () => {
  it('tells whether another output of the recipe prints the same part', () => {
    const caps = plate('p1', 'cap', 'hook');
    const spareCaps = plate('p4', 'cap');

    expect(isOnlySourceOf(caps.outputs[1], [caps, spareCaps])).toBe(true);
    expect(isOnlySourceOf(caps.outputs[0], [caps, spareCaps])).toBe(false);
    expect(isOnlySourceOf(spareCaps.outputs[0], [caps, spareCaps])).toBe(false);
  });
});

describe('removeOutputQuestion and swapOutputQuestion (T2-07)', () => {
  it('say what is left without a plate, like removing the plate does', () => {
    const removing = removeOutputQuestion('Trasera de calavera', true);
    expect(removing).toContain('¿Quitar «Trasera de calavera» de esta placa?');
    expect(removing).toContain('Es la única placa de la receta que la imprime.');
    expect(removing).toContain('el plan no sabrá con qué placa hacerla');

    const swapping = swapOutputQuestion('Tapa', 'Gancho', { asked: true, owner: true });
    expect(swapping).toContain('¿Cambiar «Tapa» por «Gancho» en esta placa?');
    expect(swapping).toContain('Es la única placa de la receta que imprime «Tapa».');
    expect(swapping).toContain('quítala también de «Piezas impresas por unidad»');
  });

  it('only say it stops coming out of the runs when the recipe does not take the part', () => {
    const removing = removeOutputQuestion('Gancho', false);
    expect(removing).toContain('la receta no la pide: ya no saldrá de sus corridas.');
    expect(removing).not.toContain('sigue pidiendo');

    const swapping = swapOutputQuestion('Gancho', 'Tapa', { asked: false, owner: true });
    expect(swapping).toContain('Es la única placa de la receta que imprime «Gancho», y la receta no la pide');
    expect(swapping).not.toContain('Piezas impresas por unidad');
  });

  it('tell the operator to ask the owner, who is the one who can take a part off the recipe', () => {
    const swapping = swapOutputQuestion('Trasera', 'Gancho', { asked: true, owner: false });

    expect(swapping).toContain('pídele al dueño que la quite de «Piezas impresas por unidad»');
    expect(swapping).not.toContain('quítala');
  });
});
