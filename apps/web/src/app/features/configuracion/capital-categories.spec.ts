import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { ConfiguracionData } from './configuracion.data';
import type { CategoryRecord } from './configuracion.models';
import { defaultCategoryOptions } from './payment-categories-section';

/** `transaction_categories` that records what is written to it. */
function categoriesTable() {
  const written: Record<string, unknown>[] = [];
  const supabase = {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        written.push(values);
        const chain = { eq: () => chain, select: async () => ({ data: [{ id: 'cat-1' }], error: null }) };
        return chain;
      },
      insert: async (values: Record<string, unknown>) => {
        written.push(values);
        return { error: null };
      },
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: supabase },
      { provide: CurrentWorkspace, useValue: { requireId: async () => 'workspace-1' } },
    ],
  });
  return { data: TestBed.inject(ConfiguracionData), written };
}

describe('ConfiguracionData.saveCategory, capital', () => {
  it('marks a category of capital, of either direction', async () => {
    const { data, written } = categoriesTable();

    await data.saveCategory(null, { name: 'Retiro del dueño', direction: 'expense', active: true, sales: false, capital: true });

    expect(written[0]).toMatchObject({ direction: 'expense', capital: true, sales: false });
  });

  it('never sends one as of sales and of capital at once, which the database refuses', async () => {
    const { data, written } = categoriesTable();

    await data.saveCategory('cat-1', { name: 'Aporte del dueño', direction: 'income', active: true, sales: true, capital: true });

    expect(written[0]).toMatchObject({ sales: false, capital: true });
  });

  it('keeps the mark when only the state changes', async () => {
    const { data, written } = categoriesTable();

    await data.saveCategory('cat-1', { name: 'Aporte del dueño', direction: 'income', active: false, sales: false, capital: true });

    expect(written[0]).toMatchObject({ active: false, capital: true });
  });
});

describe('defaultCategoryOptions', () => {
  const category = (id: string, changes: Partial<CategoryRecord>): CategoryRecord => ({
    id,
    name: id,
    direction: 'income',
    active: true,
    sales: false,
    capital: false,
    ...changes,
  });

  it('does not offer a category of capital, nor a deactivated one, as a default', () => {
    const offered = defaultCategoryOptions([
      category('ventas', { sales: true }),
      category('aporte', { capital: true }),
      category('vieja', { active: false }),
      category('retiro', { direction: 'expense', capital: true }),
      category('envios', { direction: 'expense' }),
    ]);

    expect(offered.map((option) => option.id)).toEqual(['ventas', 'envios']);
  });
});
