import { TestBed } from '@angular/core/testing';
import { UserFacingError } from './friendly-error';
import type { MemberRole } from './workspace';
import { CurrentWorkspace } from './workspace';
import { SUPABASE } from './supabase';

const WORKSHOP = { id: 'ws-1', name: 'Pickypop', tax_regime: 'none' };

/**
 * A database where the role can change between two reads, the way it does
 * when the owner changes it from another tab.
 */
function workshopWhereRoleIs(initial: MemberRole) {
  const state = { role: initial, memberReads: 0 };
  const query = (answer: () => unknown) => {
    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => chain,
      maybeSingle: async () => answer(),
    };
    return chain;
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table: string) =>
      table === 'workspaces'
        ? query(() => ({ data: WORKSHOP, error: null }))
        : query(() => {
            state.memberReads += 1;
            return { data: { role: state.role }, error: null };
          }),
  };
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: supabase }] });
  return { workspace: TestBed.inject(CurrentWorkspace), state };
}

describe('CurrentWorkspace', () => {
  it('reads who may change what from the role', async () => {
    const { workspace } = workshopWhereRoleIs('operator');
    await workspace.info();

    expect(workspace.isOwner()).toBe(false);
    expect(workspace.canOperate()).toBe(true);
  });

  it('reads the role again after the database refuses who is asking, and stops offering what it denies', async () => {
    const { workspace, state } = workshopWhereRoleIs('owner');
    await workspace.info();
    expect(workspace.isOwner()).toBe(true);

    state.role = 'operator';
    const refused = await workspace.afterRefusal({ code: '42501', message: 'Solo el dueño del taller puede…' });

    expect(refused).toBe(true);
    expect(workspace.isOwner()).toBe(false);
    expect((await workspace.info()).role).toBe('operator');
  });

  it('offers a viewer nothing to write, and nobody anything before the role is read', async () => {
    const { workspace } = workshopWhereRoleIs('viewer');
    expect(workspace.roleKnown()).toBe(false);
    expect(workspace.canOperate()).toBe(false);

    await workspace.info();

    expect(workspace.roleKnown()).toBe(true);
    expect(workspace.canOperate()).toBe(false);
    expect(workspace.isOwner()).toBe(false);
  });

  it('forgets the role with the session, so the next person does not inherit it', async () => {
    const { workspace } = workshopWhereRoleIs('owner');
    await workspace.info();

    workspace.forget();

    expect(workspace.roleKnown()).toBe(false);
    expect(workspace.isOwner()).toBe(false);
  });

  it('reads the role again after a refusal hidden behind a message already translated', async () => {
    const { workspace, state } = workshopWhereRoleIs('operator');
    await workspace.info();
    state.role = 'viewer';

    const refused = await workspace.afterRefusal(
      new UserFacingError('No tienes permiso.', { cause: { code: '42501', message: 'new row violates row-level security policy' } }),
    );

    expect(refused).toBe(true);
    expect(workspace.canOperate()).toBe(false);
  });

  it('leaves the role alone when what was refused is what was written', async () => {
    const { workspace, state } = workshopWhereRoleIs('owner');
    await workspace.info();
    const readsBefore = state.memberReads;

    const refused = await workspace.afterRefusal({ code: '23514', message: 'violates check constraint' });

    expect(refused).toBe(false);
    expect(state.memberReads).toBe(readsBefore);
  });
});
