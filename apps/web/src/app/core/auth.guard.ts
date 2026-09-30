import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SUPABASE } from './supabase';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SUPABASE);
  const router = inject(Router);

  const { data } = await supabase.auth.getSession();

  return data.session !== null ? true : router.createUrlTree(['/login']);
};
