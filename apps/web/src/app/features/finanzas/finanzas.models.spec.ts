import {
  agingBucket,
  categoriesFor,
  categoryFitsType,
  dayEnd,
  dayStart,
  defaultCategory,
  defaultMethodFor,
  monthLabel,
  num,
  numOrNull,
  saysSale,
  TYPE_DIRECTION,
  yearOf,
  type CategoryOption,
} from './finanzas.models';

const CATEGORIES: CategoryOption[] = [
  { id: 'in-1', name: 'Venta de productos', direction: 'income' },
  { id: 'out-1', name: 'Luz', direction: 'expense' },
  { id: 'out-2', name: 'Envíos', direction: 'expense' },
];

describe('categoriesFor', () => {
  it('offers only income categories to the types that bring money in', () => {
    expect(categoriesFor('income', CATEGORIES).map((c) => c.id)).toEqual(['in-1']);
    expect(categoriesFor('owner_contribution', CATEGORIES).map((c) => c.id)).toEqual(['in-1']);
  });

  it('offers only expense categories to the types that take money out', () => {
    expect(categoriesFor('expense', CATEGORIES).map((c) => c.id)).toEqual(['out-1', 'out-2']);
    expect(categoriesFor('owner_draw', CATEGORIES).map((c) => c.id)).toEqual(['out-1', 'out-2']);
  });

  it('offers none to a transfer, which is neither earning nor spending', () => {
    expect(TYPE_DIRECTION.transfer).toBeNull();
    expect(categoriesFor('transfer', CATEGORIES)).toEqual([]);
  });
});

describe('categoryFitsType', () => {
  it('keeps a category that matches the direction of the type', () => {
    expect(categoryFitsType('income', 'in-1', CATEGORIES)).toBe(true);
    expect(categoryFitsType('expense', 'out-2', CATEGORIES)).toBe(true);
  });

  it('drops one that belongs to the other direction', () => {
    expect(categoryFitsType('income', 'out-1', CATEGORIES)).toBe(false);
    expect(categoryFitsType('transfer', 'in-1', CATEGORIES)).toBe(false);
  });

  it('accepts having no category at all', () => {
    expect(categoryFitsType('income', null, CATEGORIES)).toBe(true);
  });
});

describe('agingBucket', () => {
  it('separates what is on time from what is late', () => {
    expect(agingBucket(0)).toBe('current');
    expect(agingBucket(1)).toBe('recent');
    expect(agingBucket(15)).toBe('recent');
    expect(agingBucket(16)).toBe('late');
    expect(agingBucket(30)).toBe('late');
    expect(agingBucket(31)).toBe('very_late');
  });
});

describe('num', () => {
  it('reads a numeric column that arrives as a string', () => {
    expect(num('1250.50')).toBe(1250.5);
    expect(num(1250.5)).toBe(1250.5);
  });

  it('falls back to zero instead of NaN', () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('no es un número')).toBe(0);
  });
});

describe('numOrNull', () => {
  it('tells a missing value apart from a zero', () => {
    expect(numOrNull('0')).toBe(0);
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull('')).toBeNull();
  });
});

describe('monthLabel', () => {
  it('keeps the calendar month of a date column (no UTC shift)', () => {
    expect(monthLabel('2026-10-01')).toBe('Octubre de 2026');
    expect(monthLabel('2026-01-01')).toBe('Enero de 2026');
  });
});

describe('yearOf', () => {
  it('takes the year out of a month key', () => {
    expect(yearOf('2026-10-01')).toBe('2026');
  });
});

describe('dayStart / dayEnd', () => {
  it('cuts the day at midnight in Lima', () => {
    expect(dayStart('2026-10-04')).toBe('2026-10-04T00:00:00-05:00');
    expect(dayEnd('2026-10-04')).toBe('2026-10-04T23:59:59.999-05:00');
    expect(new Date(dayEnd('2026-10-04')).toISOString()).toBe('2026-10-05T04:59:59.999Z');
  });
});

describe('defaultCategory', () => {
  it('uses the one the owner chose', () => {
    expect(defaultCategory('expense', 'out-2', CATEGORIES)?.id).toBe('out-2');
  });

  it('uses the only category of its direction when none was chosen', () => {
    expect(defaultCategory('income', null, CATEGORIES)?.id).toBe('in-1');
  });

  it('does not guess between two', () => {
    expect(defaultCategory('expense', null, CATEGORIES)).toBeNull();
  });

  it('ignores a choice that is no longer offered, and falls back on the only one', () => {
    expect(defaultCategory('income', 'deactivated', CATEGORIES)?.id).toBe('in-1');
    expect(defaultCategory('expense', 'deactivated', CATEGORIES)).toBeNull();
  });

  it('never files an expense under an income category', () => {
    expect(defaultCategory('expense', 'in-1', CATEGORIES)).toBeNull();
  });

  it('has nothing when the workshop has no category of that direction', () => {
    expect(defaultCategory('income', null, [])).toBeNull();
  });
});

describe('defaultMethodFor', () => {
  it('says cash for a cash box, which has no other way to be paid', () => {
    expect(defaultMethodFor('cash')).toBe('cash');
  });

  it('leaves a bank or a wallet to the person: they take more than one method', () => {
    expect(defaultMethodFor('bank')).toBeNull();
    expect(defaultMethodFor('wallet')).toBeNull();
  });
});

describe('saysSale', () => {
  const income = (id: string, name: string): CategoryOption => ({ id, name, direction: 'income' });

  it('recognises the category collections of orders go to, whatever its name', () => {
    expect(saysSale(income('in-9', 'Ingresos varios'), 'in-9')).toBe(true);
  });

  it('recognises a category whose name says sale, commission or order', () => {
    expect(saysSale(income('a', 'Venta de productos'), null)).toBe(true);
    expect(saysSale(income('b', 'Trabajos por encargo'), null)).toBe(true);
    expect(saysSale(income('c', 'Ventas'), null)).toBe(true);
    expect(saysSale(income('d', 'Cobros de pedidos'), null)).toBe(true);
  });

  it('leaves alone what is not a sale, and what is not an income', () => {
    expect(saysSale(income('e', 'Reembolsos'), 'in-9')).toBe(false);
    // «Eventos» has «vent» in it, but it is not a sale.
    expect(saysSale(income('f', 'Eventos'), null)).toBe(false);
    expect(saysSale({ id: 'g', name: 'Comisiones de venta', direction: 'expense' }, null)).toBe(false);
    expect(saysSale(null, null)).toBe(false);
  });
});
