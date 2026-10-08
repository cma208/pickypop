import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CurrentWorkspace, type MemberRole } from '../../core/workspace';
import { canOperateRole, ProductionAccess } from './production-access';

describe('canOperateRole', () => {
  it('lets the owner and the operator run production, and not a viewer', () => {
    expect(canOperateRole('owner')).toBe(true);
    expect(canOperateRole('operator')).toBe(true);
    expect(canOperateRole('viewer')).toBe(false);
  });

  it('offers nothing while the role is unknown, or to someone who is not a member', () => {
    expect(canOperateRole(null)).toBe(false);
    expect(canOperateRole(undefined)).toBe(false);
  });
});

describe('ProductionAccess', () => {
  it('follows the role the workspace loads', () => {
    const role = signal<MemberRole | null>(null);
    const info = vi.fn(async () => ({ id: 'ws', name: 'Pickypop', taxRegime: 'none' as const, role: 'operator' as const, userId: 'u' }));
    TestBed.configureTestingModule({ providers: [{ provide: CurrentWorkspace, useValue: { role, info } }] });
    const access = TestBed.inject(ProductionAccess);

    expect(info).toHaveBeenCalled();
    expect(access.canOperate()).toBe(false);
    role.set('operator');
    expect(access.canOperate()).toBe(true);
    role.set('viewer');
    expect(access.canOperate()).toBe(false);
  });
});
