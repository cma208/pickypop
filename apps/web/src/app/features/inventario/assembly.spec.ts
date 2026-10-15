import { assemblyOutcome, boughtComponentIds, costPageOf, uncostedComponents } from './assembly';
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

describe('uncostedComponents', () => {
  const parts = [
    component({ inventoryItemId: 'front', name: 'Frente de calavera', kind: 'part' }),
    component({ inventoryItemId: 'bag', name: 'Bolsa kraft', kind: 'packaging' }),
    component({ inventoryItemId: 'sweets', name: 'Dulces surtidos', kind: 'supply', unit: 'g' }),
    component({ inventoryItemId: 'magnet', name: 'Imán', kind: 'spare_part' }),
    component({ inventoryItemId: 'gift', name: 'Llavero', kind: 'finished_good' }),
  ];

  it('asks only for what is bought: a printed part or a finished product costs what making it cost', () => {
    expect(boughtComponentIds(parts)).toEqual(['bag', 'sweets', 'magnet']);
  });

  it('names the bought components without cost, each with the page where it is given', () => {
    const sources = new Map([
      ['bag', 'unknown' as const],
      ['sweets', 'standard' as const],
      ['magnet', 'unknown' as const],
      // The view says «unknown» for these two, and no page gives them a cost.
      ['front', 'unknown' as const],
      ['gift', 'unknown' as const],
    ]);

    expect(uncostedComponents(parts, sources).map((row) => [row.component.name, row.page.route, row.page.label])).toEqual([
      ['Bolsa kraft', '/inventario/empaque', 'Empaque'],
      ['Imán', '/inventario/insumos', 'Insumos'],
    ]);
  });

  it('does not call «without cost» what has not been read yet', () => {
    expect(uncostedComponents(parts, new Map())).toEqual([]);
  });

  it('knows where each kind is listed', () => {
    expect(costPageOf('supply')?.route).toBe('/inventario/insumos');
    expect(costPageOf('spare_part')?.route).toBe('/inventario/insumos');
    expect(costPageOf('packaging')?.route).toBe('/inventario/empaque');
    expect(costPageOf('part')).toBeNull();
    expect(costPageOf('finished_good')).toBeNull();
  });
});
