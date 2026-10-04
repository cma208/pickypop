import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../../core/supabase';
import type { Database } from '../../../core/database.types';
import { UserFacingError } from './friendly-error';

export type MemberRole = Database['public']['Enums']['member_role'];

export interface WorkspaceInfo {
  id: string;
  name: string;
  /** Role of the signed-in person, or null when they are not a member. */
  role: MemberRole | null;
  userId: string | null;
}

/**
 * Which workshop the signed-in person works in. Row Level Security already
 * limits every query, but inserts need the workspace id explicitly.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceContext {
  private readonly supabase = inject(SUPABASE);
  private pending: Promise<WorkspaceInfo> | null = null;

  info(): Promise<WorkspaceInfo> {
    this.pending ??= this.fetch().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }

  async id(): Promise<string> {
    return (await this.info()).id;
  }

  private async fetch(): Promise<WorkspaceInfo> {
    const { data: session } = await this.supabase.auth.getSession();
    const userId = session.session?.user.id ?? null;

    const { data, error } = await this.supabase
      .from('workspaces')
      .select('id, name')
      .order('created_at')
      .limit(1);

    if (error) throw error;
    const workspace = data[0];
    if (!workspace) throw new UserFacingError('Tu cuenta todavía no está asociada a ningún taller.');

    let role: MemberRole | null = null;
    if (userId) {
      const member = await this.supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace.id)
        .eq('user_id', userId)
        .limit(1);
      if (member.error) throw member.error;
      role = member.data[0]?.role ?? null;
    }

    return { id: workspace.id, name: workspace.name, role, userId };
  }
}
