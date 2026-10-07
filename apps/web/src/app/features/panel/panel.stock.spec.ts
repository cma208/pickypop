import { describe, expect, it } from 'vitest';
import { belowMinimum, type BalanceRow } from './panel.stock';

/** The shelf of the local workshop, as `inventory_balances` returns it. */
const shelf: BalanceRow[] = [
  { inventory_item_id: 'front', kind: 'part', name: 'Frente de calavera', unit: 'unidad', min_stock: '2.000', on_hand: '0.000' },
  { inventory_item_id: 'back', kind: 'part', name: 'Trasera de calavera', unit: 'unidad', min_stock: '2.000', on_hand: '0.000' },
  { inventory_item_id: 'cap', kind: 'part', name: 'Tapa de calavera', unit: 'unidad', min_stock: '7.000', on_hand: '4.000' },
  { inventory_item_id: 'hook', kind: 'part', name: 'Gancho de calavera', unit: 'unidad', min_stock: '7.000', on_hand: '5.000' },
  { inventory_item_id: 'sweets', kind: 'supply', name: 'Dulces surtidos', unit: 'g', min_stock: '500.000', on_hand: '900.000' },
  { inventory_item_id: 'bag', kind: 'packaging', name: 'Bolsa con etiqueta', unit: 'unidad', min_stock: '20.000', on_hand: '48.000' },
  { inventory_item_id: 'skull', kind: 'finished_good', name: 'Calavera dulcera', unit: 'unidad', min_stock: '0.000', on_hand: '0.000' },
];

describe('belowMinimum', () => {
  it('lists what is under its minimum, emptiest first', () => {
    expect(belowMinimum(shelf).map((item) => item.name)).toEqual([
      'Frente de calavera',
      'Trasera de calavera',
      'Tapa de calavera',
      'Gancho de calavera',
    ]);
  });

  it('says how much there is and the minimum, in the unit of the item', () => {
    const [front] = belowMinimum(shelf);
    expect(front).toMatchObject({ onHandText: '0 unidades', minimumText: 'Mínimo 2 unidades', route: '/inventario/piezas' });

    const sweets = belowMinimum([{ ...shelf[4]!, on_hand: '300' }]);
    expect(sweets[0]).toMatchObject({ onHandText: '300 g', minimumText: 'Mínimo 500 g', route: '/inventario/insumos' });
  });

  it('leaves alone what has no minimum, what is at it and finished products', () => {
    const atMinimum: BalanceRow = { ...shelf[5]!, on_hand: '20' };
    const productWithMinimum: BalanceRow = { ...shelf[6]!, min_stock: '3' };

    expect(belowMinimum([atMinimum, productWithMinimum, shelf[6]!])).toEqual([]);
  });

  it('sends packaging to its own screen', () => {
    expect(belowMinimum([{ ...shelf[5]!, on_hand: '3' }])[0]?.route).toBe('/inventario/empaque');
  });
});
