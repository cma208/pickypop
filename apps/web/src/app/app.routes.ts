import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/**
 * Every screen is declared here so the navigation is stable while the pages
 * themselves are built. Each page lives in its own feature folder.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: 'hoy', loadComponent: () => import('./features/panel/panel.page').then((m) => m.PanelPage) },
      { path: 'panel', pathMatch: 'full', redirectTo: 'hoy' },

      { path: 'inventario/filamentos', loadComponent: () => import('./features/inventario/filamentos.page').then((m) => m.FilamentosPage) },
      // Spools live inside their filament now; the old link still has to work.
      { path: 'inventario/rollos', pathMatch: 'full', redirectTo: 'inventario/filamentos' },
      { path: 'inventario/compras', loadComponent: () => import('./features/inventario/compras.page').then((m) => m.ComprasPage) },
      { path: 'inventario/insumos', loadComponent: () => import('./features/inventario/insumos.page').then((m) => m.InsumosPage) },
      { path: 'inventario/movimientos', loadComponent: () => import('./features/inventario/movimientos.page').then((m) => m.MovimientosPage) },

      { path: 'catalogo', loadComponent: () => import('./features/catalogo/catalogo.page').then((m) => m.CatalogoPage) },
      { path: 'catalogo/:id', loadComponent: () => import('./features/catalogo/producto.page').then((m) => m.ProductoPage) },

      { path: 'cotizador', loadComponent: () => import('./features/cotizador/cotizador.page').then((m) => m.CotizadorPage) },
      { path: 'cotizaciones', loadComponent: () => import('./features/cotizaciones/cotizaciones.page').then((m) => m.CotizacionesPage) },
      { path: 'cotizaciones/:id', loadComponent: () => import('./features/cotizaciones/cotizacion.page').then((m) => m.CotizacionPage) },

      { path: 'pedidos', loadComponent: () => import('./features/pedidos/pedidos.page').then((m) => m.PedidosPage) },
      { path: 'pedidos/nuevo', loadComponent: () => import('./features/pedidos/pedido-nuevo.page').then((m) => m.PedidoNuevoPage) },
      { path: 'pedidos/:id', loadComponent: () => import('./features/pedidos/pedido.page').then((m) => m.PedidoPage) },

      { path: 'finanzas/cuentas', loadComponent: () => import('./features/finanzas/cuentas.page').then((m) => m.CuentasPage) },
      { path: 'finanzas/movimientos', loadComponent: () => import('./features/finanzas/movimientos.page').then((m) => m.MovimientosFinancierosPage) },
      { path: 'finanzas/por-cobrar', loadComponent: () => import('./features/finanzas/por-cobrar.page').then((m) => m.PorCobrarPage) },
      { path: 'finanzas/resultados', loadComponent: () => import('./features/finanzas/resultados.page').then((m) => m.ResultadosPage) },

      { path: 'produccion', loadComponent: () => import('./features/produccion/produccion.page').then((m) => m.ProduccionPage) },
      { path: 'impresoras', loadComponent: () => import('./features/impresoras/impresoras.page').then((m) => m.ImpresorasPage) },
      { path: 'clientes', loadComponent: () => import('./features/clientes/clientes.page').then((m) => m.ClientesPage) },
      { path: 'configuracion', loadComponent: () => import('./features/configuracion/configuracion.page').then((m) => m.ConfiguracionPage) },

      { path: '', pathMatch: 'full', redirectTo: 'hoy' },
    ],
  },
  { path: '**', redirectTo: '' },
];
