import { computed, signal, type Provider } from '@angular/core';
import { canOperateRole, CurrentWorkspace, isOwnerRole, type MemberRole, type WorkspaceInfo } from './workspace';

/**
 * A `CurrentWorkspace` for specs, signed in with `role`: the one place a
 * screen reads who may do what (ADR-025). `role` can change mid-test, the way
 * it does when the owner changes it from another tab.
 */
export function fakeWorkspace(initial: MemberRole | null = 'owner') {
  const role = signal<MemberRole | null>(initial);
  const info = (): WorkspaceInfo => ({ id: 'ws-1', name: 'Pickypop', taxRegime: 'none', role: role(), userId: 'user-1' });
  return {
    id: signal('ws-1'),
    name: signal('Pickypop'),
    role,
    roleKnown: signal(true),
    isOwner: computed(() => isOwnerRole(role())),
    canOperate: computed(() => canOperateRole(role())),
    info: async () => info(),
    requireId: async () => 'ws-1',
    refresh: async () => info(),
    afterRefusal: async () => false,
    forget: () => undefined,
  };
}

/** The provider of `fakeWorkspace`, for `TestBed.configureTestingModule`. */
export function workspaceAs(role: MemberRole | null = 'owner'): Provider {
  return { provide: CurrentWorkspace, useValue: fakeWorkspace(role) };
}
