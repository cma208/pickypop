import { InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** One client for the whole app. Access is decided by the database, not here. */
export const SUPABASE = new InjectionToken<SupabaseClient>('SupabaseClient', {
  providedIn: 'root',
  factory: () => createClient(environment.supabaseUrl, environment.supabaseAnonKey),
});
