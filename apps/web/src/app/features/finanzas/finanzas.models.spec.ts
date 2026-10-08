import {
  agingBucket,
  cashCategoriesFor,
  categoriesFor,
  categoryFitsType,
  dayEnd,
  dayStart,
  defaultCategory,
  defaultMethodFor,
  monthLabel,
  num,
  numOrNull,
  TYPE_DIRECTION,
  yearOf,
  type CategoryOption,
} from './finanzas.models';

const CATEGORIES: CategoryOption[] = [
  { id: 'in-1', name: 'Venta de productos', direction: 'income', sales: true },
  { id: 'out-1', name: 'Luz', direction: 'expense', sales: false },
  { id: 'out-2', name: 'Envíos', direction: 'expense', sales: false },
];

/** With a refund, which is an income that is not a sale. */
const WITH_REFUNDS: CategoryOption[] = [
  ...CATEGORIES,
  { id: 'in-2', name: 'Reembolsos', direction: 'income', sales: false },
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

describe('cashCategoriesFor', () => {
  it('does not offer a loose income the categories of sales', () => {
    expect(cashCategoriesFor('income', WITH_REFUNDS).map((c) => c.id)).toEqual(['in-2']);
  });

  it('offers them to capital coming in, and leaves the expenses alone', () => {
    expect(cashCategoriesFor('owner_contribution', WITH_REFUNDS).map((c) => c.id)).toEqual(['in-1', 'in-2']);
    expect(cashCategoriesFor('expense', WITH_REFUNDS).map((c) => c.id)).toEqual(['out-1', 'out-2']);
    expect(cashCategoriesFor('transfer', WITH_REFUNDS)).toEqual([]);
  });

  it('leaves the list of a collection whole: categoriesFor still has them', () => {
    expect(categoriesFor('income', WITH_REFUNDS).map((c) => c.id)).toEqual(['in-1', 'in-2']);
  });
});

describe('categoryFitsType', () => {
  it('keeps a category that matches the direction of the type', () => {
    expect(categoryFitsType('income', 'in-2', WITH_REFUNDS)).toBe(true);
    expect(categoryFitsType('owner_contribution', 'in-1', CATEGORIES)).toBe(true);
    expect(categoryFitsType('expense', 'out-2', CATEGORIES)).toBe(true);
  });

  it('drops a category of sales when the movement becomes a loose income', () => {
    expect(categoryFitsType('income', 'in-1', CATEGORIES)).toBe(false);
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
