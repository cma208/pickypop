import { InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { environment } from '../../environments/environment';

/** One client for the whole app. Access is decided by the database, not here. */
export const SUPABASE = new InjectionToken<SupabaseClient<Database>>('SupabaseClient', {
  providedIn: 'root',
  factory: () => createClient<Database>(environment.supabaseUrl, environment.supabaseAnonKey),
});
