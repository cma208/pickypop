import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/**
 * Every screen is declared here so the navigation is stable while the pages
 * themselves are built. Each page lives in its own feature folder.
 */
export const routes: Routes = [
  {
    path: 'login', title: 'Entrar',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: 'hoy', title: 'Hoy', loadComponent: () => import('./features/panel/panel.page').then((m) => m.PanelPage) },
      { path: 'panel', pathMatch: 'full', redirectTo: 'hoy' },

      { path: 'inventario/filamentos', title: 'Filamentos', loadComponent: () => import('./features/inventario/filamentos.page').then((m) => m.FilamentosPage) },
      // Spools live inside their filament now; the old link still has to work.
      { path: 'inventario/rollos', pathMatch: 'full', redirectTo: 'inventario/filamentos' },
      { path: 'inventario/compras', title: 'Compras', loadComponent: () => import('./features/inventario/compras.page').then((m) => m.ComprasPage) },
      { path: 'inventario/piezas', title: 'Piezas impresas', loadComponent: () => import('./features/inventario/piezas.page').then((m) => m.PiezasPage) },
      {
        path: 'inventario/insumos',
        title: 'Insumos',
        // Los dos usan la misma pantalla; lo que cambia es qué tipos viven en
        // cada una. Llega como entrada por `withComponentInputBinding`.
        data: {
          scope: ['supply', 'spare_part'],
          heading: 'Insumos y repuestos',
          subtitle: 'Dulces, imanes, boquillas y todo lo que se cuenta por unidad',
        },
        loadComponent: () => import('./features/inventario/insumos.page').then((m) => m.InsumosPage),
      },
      {
        path: 'inventario/empaque',
        title: 'Empaque',
        data: {
          scope: ['packaging'],
          heading: 'Empaque',
          subtitle: 'Bolsas, cajas, cintas y etiquetas',
        },
        loadComponent: () => import('./features/inventario/insumos.page').then((m) => m.InsumosPage),
      },
      { path: 'inventario/movimientos', title: 'Kardex', loadComponent: () => import('./features/inventario/movimientos.page').then((m) => m.MovimientosPage) },

      { path: 'catalogo', title: 'Catálogo y recetas', loadComponent: () => import('./features/catalogo/catalogo.page').then((m) => m.CatalogoPage) },
      { path: 'catalogo/:id', title: 'Producto', loadComponent: () => import('./features/catalogo/producto.page').then((m) => m.ProductoPage) },

      { path: 'oportunidades', title: 'Oportunidades', loadComponent: () => import('./features/oportunidades/oportunidades.page').then((m) => m.OportunidadesPage) },

      { path: 'cotizador', title: 'Cotizador', loadComponent: () => import('./features/cotizador/cotizador.page').then((m) => m.CotizadorPage) },
      { path: 'cotizaciones', title: 'Cotizaciones', loadComponent: () => import('./features/cotizaciones/cotizaciones.page').then((m) => m.CotizacionesPage) },
      { path: 'cotizaciones/:id', title: 'Cotización', loadComponent: () => import('./features/cotizaciones/cotizacion.page').then((m) => m.CotizacionPage) },

      { path: 'pedidos', title: 'Pedidos', loadComponent: () => import('./features/pedidos/pedidos.page').then((m) => m.PedidosPage) },
      { path: 'pedidos/nuevo', title: 'Nuevo pedido', loadComponent: () => import('./features/pedidos/pedido-nuevo.page').then((m) => m.PedidoNuevoPage) },
      { path: 'pedidos/:id', title: 'Pedido', loadComponent: () => import('./features/pedidos/pedido.page').then((m) => m.PedidoPage) },

      { path: 'finanzas/cuentas', title: 'Cuentas', loadComponent: () => import('./features/finanzas/cuentas.page').then((m) => m.CuentasPage) },
      { path: 'finanzas/movimientos', title: 'Caja', loadComponent: () => import('./features/finanzas/movimientos.page').then((m) => m.MovimientosFinancierosPage) },
      { path: 'finanzas/por-cobrar', title: 'Por cobrar', loadComponent: () => import('./features/finanzas/por-cobrar.page').then((m) => m.PorCobrarPage) },
      { path: 'finanzas/resultados', title: 'Resultados', loadComponent: () => import('./features/finanzas/resultados.page').then((m) => m.ResultadosPage) },

      { path: 'produccion', title: 'Cola de impresión', loadComponent: () => import('./features/produccion/produccion.page').then((m) => m.ProduccionPage) },
      { path: 'impresoras', title: 'Impresoras', loadComponent: () => import('./features/impresoras/impresoras.page').then((m) => m.ImpresorasPage) },
      { path: 'clientes', title: 'Clientes', loadComponent: () => import('./features/clientes/clientes.page').then((m) => m.ClientesPage) },
      { path: 'configuracion', title: 'Configuración', loadComponent: () => import('./features/configuracion/configuracion.page').then((m) => m.ConfiguracionPage) },

      { path: '', pathMatch: 'full', redirectTo: 'hoy' },
    ],
  },
  { path: '**', redirectTo: '' },
];
