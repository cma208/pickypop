import { inject, Injectable, signal } from '@angular/core';
import { SUPABASE } from './supabase';

/**
 * The workshop the signed-in person works in. Inserts need its id and the
 * tables have no default for it, so every feature would otherwise look it up
 * on its own. Row Level Security already limits what comes back here.
 */
@Injectable({ providedIn: 'root' })
export class CurrentWorkspace {
  private readonly supabase = inject(SUPABASE);
  private pending: Promise<string> | null = null;

  readonly id = signal<string | null>(null);
  readonly name = signal<string | null>(null);

  /** Resolves once and caches; safe to call from anywhere. */
  async requireId(): Promise<string> {
    const known = this.id();
    if (known !== null) return known;

    this.pending ??= this.load();

    return this.pending;
  }

  private async load(): Promise<string> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Tu usuario no pertenece a ningún taller.');

    this.id.set(data.id);
    this.name.set(data.name);

    return data.id;
  }
}
