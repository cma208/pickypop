import { TestBed } from '@angular/core/testing';
import { isPermissionError, UserFacingError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { ConfiguracionData } from './configuracion.data';

/**
 * `cost_profiles` as the API sees it: a delete answers with the rows it took,
 * and zero rows both when the version is gone and when the policy hid it from
 * this role. `remaining` is what a plain read finds afterwards.
 */
function costProfilesWhere(deleted: { id: string }[], remaining: { id: string }[] | null) {
  const deleteChain = {
    eq: () => deleteChain,
    select: async () => ({ data: deleted, error: null }),
  };
  const readChain = {
    eq: () => readChain,
    limit: async () => (remaining ? { data: remaining, error: null } : { data: null, error: { message: 'Failed to fetch' } }),
  };
  const supabase = { from: () => ({ delete: () => deleteChain, select: () => readChain }) };
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: supabase }] });
  return TestBed.inject(ConfiguracionData);
}

describe('ConfiguracionData.deleteCostProfile', () => {
  it('is done when the database takes the version', async () => {
    const data = costProfilesWhere([{ id: 'v2' }], []);
    await expect(data.deleteCostProfile('v2')).resolves.toBeUndefined();
  });

  it('calls it a refusal of the role when nothing was taken and the version is still there', async () => {
    const data = costProfilesWhere([], [{ id: 'v2' }]);
    const error = await data.deleteCostProfile('v2').catch((reason: unknown) => reason);

    expect(isPermissionError(error)).toBe(true);
  });

  it('says it was already gone, without blaming the role, when another tab took it first', async () => {
    const data = costProfilesWhere([], []);
    const error = await data.deleteCostProfile('v2').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UserFacingError);
    expect(isPermissionError(error)).toBe(false);
    expect((error as Error).message).toContain('ya no estaba');
  });

  it('stays honest about not knowing when the second read fails', async () => {
    const data = costProfilesWhere([], null);
    const error = await data.deleteCostProfile('v2').catch((reason: unknown) => reason);

    expect(isPermissionError(error)).toBe(false);
    expect((error as Error).message).toContain('No se quitó nada');
  });
});
