import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';

/**
 * Inserts need the workshop id explicitly. Row Level Security only lets the
 * signed-in person see their own workshop, so the first visible row is it.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceScope {
  private readonly supabase = inject(SUPABASE);
  private cached: Promise<string> | null = null;

  id(): Promise<string> {
    this.cached ??= this.lookup().catch((error: unknown) => {
      this.cached = null;
      throw error;
    });
    return this.cached;
  }

  private async lookup(): Promise<string> {
    const { data, error } = await this.supabase.from('workspaces').select('id').limit(1);
    if (error) throw error;

    const id = data[0]?.id;
    if (!id) throw new Error('No workshop found for this session');
    return id;
  }
}
