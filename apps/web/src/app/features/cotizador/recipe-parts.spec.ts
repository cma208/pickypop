import { describe, expect, it } from 'vitest';
import { itemsBeyondPlates, printedByPlates } from './recipe-parts';

/** The «Calavera dulcera» recipe as the local database has it. */
const plates = [
  { outputs: [{ inventoryItemId: 'tapa' }, { inventoryItemId: 'gancho' }] },
  { outputs: [{ inventoryItemId: 'frente' }] },
  { outputs: [{ inventoryItemId: 'trasera' }] },
];
const items = ['bolsa', 'dulces', 'frente', 'gancho', 'lamina', 'tapa', 'trasera'].map((id) => ({
  inventoryItemId: id,
  quantityPerUnit: 1,
}));

describe('recipe parts', () => {
  it('leaves out the parts its own plates print: their cost is the plates', () => {
    const own = itemsBeyondPlates(items, printedByPlates(plates));

    expect(own.map((item) => item.inventoryItemId)).toEqual(['bolsa', 'dulces', 'lamina']);
  });

  it('keeps a part another recipe prints: this one pays for it as an input', () => {
    const withBorrowed = [...items, { inventoryItemId: 'iman-impreso', quantityPerUnit: 2 }];

    const own = itemsBeyondPlates(withBorrowed, printedByPlates(plates));

    expect(own.map((item) => item.inventoryItemId)).toContain('iman-impreso');
  });

  it('keeps everything when the plates say nothing about what they print', () => {
    // A plate with no outputs on record vouches for nothing, so nothing is left out.
    const silent = plates.map(() => ({ outputs: [] }));

    expect(itemsBeyondPlates(items, printedByPlates(silent))).toHaveLength(items.length);
  });
});
