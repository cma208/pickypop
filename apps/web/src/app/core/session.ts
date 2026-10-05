import { inject, Injectable, signal } from '@angular/core';
import { SUPABASE } from './supabase';
import { CurrentWorkspace } from './workspace';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  readonly email = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  async restore(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this.email.set(data.session?.user.email ?? null);
  }

  async signIn(email: string, password: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);

    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    this.busy.set(false);

    if (error) {
      this.error.set('No pudimos entrar: revisa el correo y la contraseña.');
      return false;
    }

    this.email.set(data.user?.email ?? null);
    return true;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.email.set(null);
    // Two people share this workshop and may share a browser.
    this.workspace.forget();
  }
}
