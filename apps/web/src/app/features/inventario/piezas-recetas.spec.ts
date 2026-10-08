import { describe, expect, it } from 'vitest';
import { deactivatedNote, deactivationWarning, describeUses } from './piezas-recetas';

const SKULL = { product: 'Calavera dulcera · Con dulces surtidos', plates: [1], perUnit: 1 };
const COASTER = { product: 'Posavasos · Blanco', plates: [], perUnit: 2 };

describe('describeUses', () => {
  it('names each recipe and the plates that print the part', () => {
    expect(describeUses([SKULL])).toBe('Calavera dulcera · Con dulces surtidos (sale de la placa 1)');
    expect(describeUses([{ ...SKULL, plates: [1, 4] }, COASTER])).toBe(
      'Calavera dulcera · Con dulces surtidos (sale de las placas 1, 4) y Posavasos · Blanco',
    );
  });
});

describe('deactivationWarning (T2-13)', () => {
  it('warns before switching off a part a recipe uses', () => {
    expect(deactivationWarning('Gancho', [SKULL])).toBe(
      '«Gancho» la usa la receta de Calavera dulcera · Con dulces surtidos (sale de la placa 1). ' +
        'Si la desactivas, deja de ofrecerse al elegir piezas y sale del conteo del estante, pero esa receta la sigue ' +
        'pidiendo, y donde sale de una placa, la placa la sigue imprimiendo.',
    );
  });

  it('says nothing for a part no recipe uses', () => {
    expect(deactivationWarning('Gancho', [])).toBeNull();
  });
});

describe('deactivatedNote', () => {
  it('says the part went off, which recipes still use it and where to bring it back', () => {
    expect(deactivatedNote('Gancho', [SKULL, COASTER])).toBe(
      '«Gancho» quedó desactivada, y la siguen usando: Calavera dulcera · Con dulces surtidos (sale de la placa 1) ' +
        'y Posavasos · Blanco. Si fue un error, vuelve a activarla abajo, en «Desactivadas».',
    );
  });

  it('is the usual note when nothing uses it', () => {
    expect(deactivatedNote('Gancho', [])).toBe('Cambios guardados.');
  });
});
