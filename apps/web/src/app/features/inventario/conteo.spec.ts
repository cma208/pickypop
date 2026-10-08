import {
  countHint,
  countPayload,
  difference,
  initialCount,
  isChanged,
  keepCounts,
  needsCost,
  rowProblem,
  saveLabel,
  type CountRow,
} from './conteo';

const row = (overrides: Partial<CountRow> = {}): CountRow => ({
  kind: 'part',
  inventoryItemId: 'cap',
  variantId: null,
  name: 'Tapa impresa',
  detail: null,
  imagePath: null,
  onHand: 5,
  knownCost: 0.131,
  counted: 5,
  typedCost: null,
  ...overrides,
});

describe('counting the shelf', () => {
  it('leaves out what already matches', () => {
    expect(isChanged(row())).toBe(false);
    expect(countPayload([row()])).toEqual([]);
    expect(saveLabel([row()])).toBe('Todo coincide');
  });

  it('sends a part by its article and a product by its variant', () => {
    const payload = countPayload([
      row({ counted: 7 }),
      row({ kind: 'product', inventoryItemId: null, variantId: 'potion', onHand: 0, knownCost: 2.4, counted: 3 }),
    ]);

    expect(payload).toEqual([
      { inventory_item_id: 'cap', counted: 7 },
      { variant_id: 'potion', counted: 3 },
    ]);
  });

  it('asks for a cost only for units that come in without one', () => {
    expect(needsCost(row({ counted: 7, knownCost: null }))).toBe(true);
    expect(needsCost(row({ counted: 3, knownCost: null }))).toBe(false);
    expect(needsCost(row({ counted: 7 }))).toBe(false);
  });

  it('sends the typed cost only when the database knows none', () => {
    expect(countPayload([row({ counted: 7, knownCost: null, typedCost: 0.2 })])).toEqual([
      { inventory_item_id: 'cap', counted: 7, unit_cost: 0.2 },
    ]);
    expect(countPayload([row({ counted: 7, typedCost: 0.2 })])).toEqual([{ inventory_item_id: 'cap', counted: 7 }]);
  });

  it('says why a row cannot be sent yet', () => {
    expect(rowProblem(row({ counted: -1 }))).toContain('entero');
    expect(rowProblem(row({ counted: 2.5 }))).toContain('entero');
    expect(rowProblem(row({ counted: 7, knownCost: null }))).toContain('costo');
    expect(rowProblem(row({ counted: 7, knownCost: null, typedCost: 0.2 }))).toBeNull();
    expect(rowProblem(row({ counted: null }))).toBeNull();
  });

  it('counts fewer as a negative difference and names the corrections', () => {
    const rows = [row({ counted: 3 }), row({ inventoryItemId: 'bottle', counted: 9 })];

    expect(difference(rows[0]!)).toBe(-2);
    expect(saveLabel(rows)).toBe('Guardar 2 correcciones');
    expect(saveLabel([rows[0]!])).toBe('Guardar 1 corrección');
  });
});

describe('half a cap on the shelf (T3-04)', () => {
  it('starts the row empty instead of proposing what nobody can count', () => {
    expect(initialCount(6)).toBe(6);
    expect(initialCount(6.5)).toBeNull();
  });

  it('leaves that row out of the way of the rest of the count, and says why it is empty', () => {
    const half = row({ onHand: 6.5, counted: initialCount(6.5) });
    expect(rowProblem(half)).toBeNull();
    expect(isChanged(half)).toBe(false);
    expect(countHint(half)).toContain('decimales');
    expect(countHint(row())).toBeNull();
  });
});

describe('a count turned down (T3-16)', () => {
  it('reads what the app believes again and keeps what the person counted', () => {
    const before = [row({ counted: 7, typedCost: 0.2 }), row({ inventoryItemId: 'bottle', onHand: 9, counted: 9 })];
    const fresh = [row({ onHand: 4, counted: 4 }), row({ inventoryItemId: 'bottle', onHand: 8, counted: 8 })];

    const merged = keepCounts(fresh, before);

    expect(merged[0]).toMatchObject({ onHand: 4, counted: 7, typedCost: 0.2 });
    // Left alone, it follows what the app believes now: not a correction back to 9.
    expect(merged[1]).toMatchObject({ onHand: 8, counted: 8 });
  });
});
