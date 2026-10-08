import { assemblyOutcome } from './assembly';
import type { AssemblyComponent } from './inventario.data';

function component(overrides: Partial<AssemblyComponent>): AssemblyComponent {
  return {
    inventoryItemId: 'front',
    name: 'Frente de calavera',
    unit: 'unidad',
    kind: 'part',
    imagePath: null,
    quantityPerUnit: 1,
    onHand: 3,
    ...overrides,
  };
}

const SKULL = { productName: 'Calavera dulcera', variantName: 'Con dulces surtidos' };

describe('assemblyOutcome', () => {
  it('says what leaves the shelf, in each component unit, and what comes in (E3-04)', () => {
    const outcome = assemblyOutcome(2, SKULL, [
      component({}),
      component({ inventoryItemId: 'sweets', name: 'Dulces surtidos', kind: 'supply', unit: 'g', quantityPerUnit: 66 }),
    ]);

    expect(outcome.leaving.map((row) => `${row.amount} de ${row.component.name}`)).toEqual([
      '2 unidades de Frente de calavera',
      '132 g de Dulces surtidos',
    ]);
    expect(outcome.entering).toBe('2 unidades de Calavera dulcera (Con dulces surtidos)');
  });

  it('says one unit in the singular', () => {
    const outcome = assemblyOutcome(1, SKULL, [component({})]);
    expect(outcome.leaving[0]!.amount).toBe('1 unidad');
    expect(outcome.entering).toBe('1 unidad de Calavera dulcera (Con dulces surtidos)');
  });
});
