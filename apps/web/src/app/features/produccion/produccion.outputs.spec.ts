import { describe, expect, it } from 'vitest';
import { describeCounts, outputsOf, plannedCounts, type PlatePart } from './produccion.outputs';

const CAP: PlatePart = { inventoryItemId: 'cap', name: 'Tapa calavera', imagePath: 'w/articulos/cap.webp', unitsPerRun: 7 };
const BODY: PlatePart = { inventoryItemId: 'body', name: 'Cuerpo calavera', imagePath: null, unitsPerRun: 7 };

describe('outputsOf', () => {
  it('sends every part of a mixed plate with what was counted for it', () => {
    const counted = new Map([
      ['cap', 7],
      ['body', 6],
    ]);

    expect(outputsOf([CAP, BODY], 'success', counted)).toEqual([
      { inventory_item_id: 'cap', units: 7 },
      { inventory_item_id: 'body', units: 6 },
    ]);
  });

  it('keeps a plate of one part as simple as one number', () => {
    expect(outputsOf([CAP], 'success', new Map([['cap', 5]]))).toEqual([{ inventory_item_id: 'cap', units: 5 }]);
  });

  it('sends a part nobody counted at its full yield, as the database would', () => {
    expect(outputsOf([CAP, BODY], 'success', new Map([['body', null]]))).toEqual([
      { inventory_item_id: 'cap', units: 7 },
      { inventory_item_id: 'body', units: 7 },
    ]);
  });

  it('sends zero when zero came out, instead of reading it as "not counted"', () => {
    expect(outputsOf([CAP], 'success', new Map([['cap', 0]]))).toEqual([{ inventory_item_id: 'cap', units: 0 }]);
  });

  it('sends nothing for a failed or cancelled job: it produced no parts', () => {
    const counted = new Map([['cap', 7]]);
    expect(outputsOf([CAP], 'failed', counted)).toBeUndefined();
    expect(outputsOf([CAP], 'cancelled', counted)).toBeUndefined();
  });

  it('sends nothing for a plate that puts nothing on the shelf', () => {
    expect(outputsOf([], 'success', new Map())).toBeUndefined();
  });
});

describe('plannedCounts', () => {
  it('is what a full run puts on the shelf', () => {
    expect(plannedCounts([CAP, BODY]).map((count) => count.units)).toEqual([7, 7]);
  });
});

describe('describeCounts', () => {
  it('names every part instead of adding them up', () => {
    expect(
      describeCounts([
        { name: 'Tapa calavera', units: 7 },
        { name: 'Cuerpo calavera', units: 6 },
      ]),
    ).toBe('7 Tapa calavera y 6 Cuerpo calavera');
  });

  it('lists three parts the way it is said', () => {
    expect(
      describeCounts([
        { name: 'A', units: 1 },
        { name: 'B', units: 2 },
        { name: 'C', units: 3 },
      ]),
    ).toBe('1 A, 2 B y 3 C');
  });

  it('leaves out a part that did not come out, and says so when none did', () => {
    expect(
      describeCounts([
        { name: 'Tapa calavera', units: 7 },
        { name: 'Cuerpo calavera', units: 0 },
      ]),
    ).toBe('7 Tapa calavera');
    expect(describeCounts([{ name: 'Tapa calavera', units: 0 }])).toBe('ninguna pieza');
  });
});
