import { FormControl } from '@angular/forms';
import {
  costAt,
  costLabel,
  costMessage,
  COST_VALIDATORS,
  isBought,
  isNoCostRefusal,
  movementCost,
  standardCostHint,
  type MovementCostInput,
} from './item-cost';

const BAGS: MovementCostInput['item'] = { name: 'Bolsa kraft', unit: 'unidad', costPerUnit: null, costSource: 'unknown' };
const BOUGHT_BAGS: MovementCostInput['item'] = { ...BAGS, costPerUnit: 0.8, costSource: 'purchase' };

/** The currency is written with a non-breaking space: «S/\u00a00.80». */
const plain = (text: string | null) => text?.replace(/\u00a0/g, ' ') ?? null;

function typed(value: number | null): FormControl<number | null> {
  const control = new FormControl<number | null>(value, COST_VALIDATORS);
  control.markAsDirty();
  return control;
}

function asked(overrides: Partial<MovementCostInput>) {
  const cost = movementCost({ item: BAGS, mode: 'in', difference: 5, typed: null, typedValid: true, demanded: false, ...overrides });
  return { ...cost, note: plain(cost.note) };
}

describe('movementCost', () => {
  it('asks an article with no cost for one before an entry, an exit or a count that differs', () => {
    for (const [mode, difference] of [['in', 5], ['out', -2], ['count', 3]] as const) {
      const cost = asked({ mode, difference });
      expect(cost.asks).toBe(true);
      expect(cost.missing).toBe('Bolsa kraft todavía no tiene costo: escribe cuánto vale cada unidad.');
    }
  });

  it('asks before the quantity is written, except for a count, which may still match', () => {
    expect(asked({ mode: 'in', difference: null }).asks).toBe(true);
    expect(asked({ mode: 'count', difference: null })).toEqual({ asks: false, missing: null, invalid: false, note: null });
  });

  it('says what it moves at once typed, and that it stays as its cost', () => {
    expect(asked({ typed: 0.35 })).toEqual({
      asks: true,
      missing: null,
      invalid: false,
      note: 'Entra a S/ 0.35 por unidad, que queda como su costo.',
    });
    expect(asked({ typed: 0.35, mode: 'out', difference: -2 }).note).toBe('Sale a S/ 0.35 por unidad, que queda como su costo.');
  });

  it('holds a wrong cost back, for the field to say why', () => {
    expect(asked({ typed: 0, typedValid: false })).toEqual({ asks: true, missing: null, invalid: true, note: null });
  });

  it('asks nothing of an article with a cost, and says which one it moves at', () => {
    const cost = asked({ item: BOUGHT_BAGS });
    expect(cost).toEqual({ asks: false, missing: null, invalid: false, note: 'Entra a S/ 0.80 por unidad (de la última compra).' });
    expect(asked({ item: { ...BOUGHT_BAGS, costSource: 'standard', costPerUnit: 0.0125 } }).note).toBe(
      'Entra a S/ 0.0125 por unidad (costo estándar).',
    );
  });

  it('asks again when the database said there is no cost, whatever the dialog was shown', () => {
    expect(asked({ item: BOUGHT_BAGS, demanded: true }).asks).toBe(true);
  });
});

describe('costMessage', () => {
  it('says zero and less are not a cost, in the database words', () => {
    expect(costMessage(typed(0), 'g', true)).toBe('El costo por g tiene que ser mayor que cero.');
    expect(costMessage(typed(-0.5), 'g', true)).toBe('El costo por g tiene que ser mayor que cero.');
  });

  it('says the cap and the decimals the column keeps', () => {
    expect(costMessage(typed(100_000.01), 'unidad', false)).toBe('El costo por unidad va hasta S/ 100 000: revisa el número.');
    expect(costMessage(typed(0.12345), 'unidad', false)).toBe('El costo por unidad admite hasta 4 decimales.');
    expect(costMessage(typed(0.1234), 'unidad', false)).toBeNull();
    expect(costMessage(typed(100_000), 'unidad', false)).toBeNull();
  });

  it('asks for it only where it is required', () => {
    expect(costMessage(typed(null), 'unidad', true)).toBe('Este campo es obligatorio.');
    expect(costMessage(typed(null), 'unidad', false)).toBeNull();
  });

  it('waits until the field is used', () => {
    expect(costMessage(new FormControl<number | null>(0, COST_VALIDATORS), 'g', true)).toBeNull();
  });
});

describe('cost wording', () => {
  it('names the unit as it is written, and «unidad» while it is blank', () => {
    expect(costLabel('g')).toBe('Costo por g (S/)');
    expect(costLabel('  ')).toBe('Costo por unidad (S/)');
  });

  it('says the last purchase decides while there is one', () => {
    expect(plain(standardCostHint(0.8, 'unidad'))).toBe(
      'Hoy vale la última compra: S/ 0.80 por unidad. Este valor solo se usa mientras no haya compras.',
    );
    expect(standardCostHint(null, 'g')).toContain('Lo que vale cada g mientras no haya compras');
  });

  it('says what a movement went at', () => {
    expect(plain(costAt(0.8, 'purchase', 'unidad'))).toBe('a S/ 0.80 por unidad (de la última compra)');
  });

  it('only a supply, a bag or a spare part carries a cost of its own', () => {
    expect(['supply', 'packaging', 'spare_part'].every((kind) => isBought(kind as never))).toBe(true);
    expect(isBought('part')).toBe(false);
    expect(isBought('finished_good')).toBe(false);
  });

  it('knows the database refusal that asks for the cost', () => {
    expect(isNoCostRefusal({ code: 'P0001', message: 'Bolsa kraft todavía no tiene costo: escribe cuánto vale cada unidad.' })).toBe(true);
    expect(isNoCostRefusal({ code: 'P0001', message: 'No puedes sacar más de lo que hay: quedan 2 unidad.' })).toBe(false);
    expect(isNoCostRefusal({ code: '', message: 'todavía no tiene costo' })).toBe(false);
  });
});
