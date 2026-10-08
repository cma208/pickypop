import { computed, inject, Injectable, signal } from '@angular/core';
import type { Database } from './database.types';
import { UserFacingError } from './friendly-error';
import { SUPABASE } from './supabase';

export type MemberRole = Database['public']['Enums']['member_role'];
export type TaxRegime = Database['public']['Enums']['tax_regime'];

/**
 * Who may change what (ADR-025). The database enforces it; a screen reads it
 * only to not offer what would be refused, and to say why.
 *
 * Only the owner changes the configuration and voids money.
 */
export function isOwnerRole(role: MemberRole | null | undefined): boolean {
  return role === 'owner';
}

/** Owner and operator run the day to day; a viewer only reads. */
export function canOperateRole(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'operator';
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  /** Decides whether prices carry IGV; the domain package reads it. */
  taxRegime: TaxRegime;
  /** Role of the signed-in person, or null when they are not a member. */
  role: MemberRole | null;
  userId: string | null;
}

/**
 * The workshop the signed-in person works in. Row Level Security already
 * limits every query to it, but inserts need its id spelled out and the
 * tables have no default, so every screen would otherwise look it up again.
 */
@Injectable({ providedIn: 'root' })
export class CurrentWorkspace {
  private readonly supabase = inject(SUPABASE);
  private pending: Promise<WorkspaceInfo> | null = null;

  readonly id = signal<string | null>(null);
  readonly name = signal<string | null>(null);
  readonly taxRegime = signal<TaxRegime | null>(null);
  readonly role = signal<MemberRole | null>(null);
  /** The configuration and voiding money: owner only. */
  readonly isOwner = computed(() => isOwnerRole(this.role()));
  /** The day to day: owner or operator. */
  readonly canOperate = computed(() => canOperateRole(this.role()));

  /** Resolves once and caches; safe to call from anywhere. */
  info(): Promise<WorkspaceInfo> {
    this.pending ??= this.load().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });

    return this.pending;
  }

  async requireId(): Promise<string> {
    return (await this.info()).id;
  }

  /**
   * Two people share this workshop and may share a browser, so the cache has
   * to go when the session does, or the next person inherits it.
   */
  forget(): void {
    this.pending = null;
    this.id.set(null);
    this.name.set(null);
    this.taxRegime.set(null);
    this.role.set(null);
  }

  /**
   * Reads the role again. After the database refuses something the screen
   * offered, the role this tab remembers may be stale (the owner changed it
   * in another tab): the screen asks again and stops offering it.
   */
  refresh(): Promise<WorkspaceInfo> {
    this.pending = null;
    return this.info();
  }

  private async load(): Promise<WorkspaceInfo> {
    const { data: session } = await this.supabase.auth.getSession();
    const userId = session.session?.user.id ?? null;

    const { data, error } = await this.supabase
      .from('workspaces')
      .select('id, name, tax_regime')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new UserFacingError('Tu cuenta todavía no está asociada a ningún taller.');

    let role: MemberRole | null = null;
    if (userId) {
      const member = await this.supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', data.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (member.error) throw member.error;
      role = member.data?.role ?? null;
    }

    this.id.set(data.id);
    this.name.set(data.name);
    this.taxRegime.set(data.tax_regime);
    this.role.set(role);

    return { id: data.id, name: data.name, taxRegime: data.tax_regime, role, userId };
  }
}
