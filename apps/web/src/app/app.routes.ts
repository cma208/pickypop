import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'panel',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/panel/panel').then((m) => m.PanelPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'panel' },
  { path: '**', redirectTo: 'panel' },
];
