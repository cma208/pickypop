import { TestBed } from '@angular/core/testing';
import { isPermissionError } from '../../core/friendly-error';
import { Media } from '../../core/media';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { CatalogoData } from './catalogo.data';
import { CatalogoError } from './catalogo.util';

/** A database whose every insert answers `error`. */
function refusingWith(error: Record<string, string>): CatalogoData {
  const supabase = { from: () => ({ insert: async () => ({ error }) }) };
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: supabase },
      { provide: CurrentWorkspace, useValue: { requireId: async () => 'workspace-1' } },
      { provide: Media, useValue: {} },
    ],
  });
  return TestBed.inject(CatalogoData);
}

async function refusal(error: Record<string, string>): Promise<CatalogoError> {
  try {
    await refusingWith(error).addTier('variant-1', 5, 10);
  } catch (thrown) {
    return thrown as CatalogoError;
  }
  throw new Error('addTier did not fail');
}

describe('CatalogoData, what a refusal says', () => {
  it('keeps the catalogue its own words for a repeated row', async () => {
    const thrown = await refusal({ code: '23505', message: 'duplicate key value violates unique constraint "price_tiers_variant_id_min_quantity_valid_from_key"' });

    expect(thrown.message).toBe('Ya hay un escalón desde esa cantidad.');
  });

  it('says how large a number may be, as every other screen does', async () => {
    const thrown = await refusal({
      code: '22003',
      message: 'numeric field overflow',
      details: 'A field with precision 12, scale 2 must round to an absolute value less than 10^10.',
    });

    expect(thrown.message).toContain('9,999,999,999.99');
  });

  it('shows a sentence the database wrote word for word', async () => {
    const thrown = await refusal({ code: 'P0001', message: 'El precio de un escalón tiene que ser mayor que cero.' });

    expect(thrown.message).toBe('El precio de un escalón tiene que ser mayor que cero.');
  });

  it('lets the screen tell a refusal of the role, to read it again', async () => {
    const thrown = await refusal({ code: '42501', message: 'new row violates row-level security policy for table "price_tiers"' });

    expect(thrown.message).toContain('No tienes permiso');
    expect(isPermissionError(thrown)).toBe(true);
  });
});
