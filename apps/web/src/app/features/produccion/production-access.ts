import { computed, inject, Injectable } from '@angular/core';
import { CurrentWorkspace, type MemberRole } from '../../core/workspace';

/**
 * Owner and operator run production: print jobs, assembly and the shelf
 * count (decision of the owner, 2026-10-08). A viewer only reads.
 */
export function canOperateRole(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'operator';
}

/**
 * Whether the person signed in may run production, read from the role
 * `CurrentWorkspace` loads, as Configuración reads it. The database decides;
 * this only keeps the screens from offering what it would refuse.
 *
 * When the base area's `CurrentWorkspace.canOperate` reaches this branch,
 * this gives way to it.
 */
@Injectable({ providedIn: 'root' })
export class ProductionAccess {
  private readonly workspace = inject(CurrentWorkspace);

  /** False until the role is known: nothing is offered that could be refused. */
  readonly canOperate = computed(() => canOperateRole(this.workspace.role()));

  constructor() {
    // The shell has usually read it already; the workspace caches it.
    void this.workspace.info().catch(() => undefined);
  }
}
