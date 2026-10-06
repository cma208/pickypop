import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session } from '../core/session';

interface NavLink {
  path: string;
  label: string;
}

interface NavGroup {
  title: string;
  links: NavLink[];
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);
  protected readonly session = inject(Session);
  protected readonly menuOpen = signal(false);

  /**
   * Grouped by the part of the business you are in, not by the part of the
   * system. Nouns, which is the convention everywhere else (Odoo, ERPNext,
   * Shopify) and what the owner asked for. Entries only appear once their
   * screen exists: a link to an empty page is worse than no link.
   */
  protected readonly groups: NavGroup[] = [
    { title: 'Taller', links: [{ path: '/hoy', label: 'Hoy' }] },
    {
      title: 'Ventas',
      links: [
        { path: '/cotizador', label: 'Cotizador' },
        { path: '/cotizaciones', label: 'Cotizaciones' },
        { path: '/pedidos', label: 'Pedidos' },
        { path: '/clientes', label: 'Clientes' },
      ],
    },
    {
      title: 'Producción',
      links: [
        { path: '/produccion', label: 'Cola de impresión' },
        { path: '/catalogo', label: 'Catálogo y recetas' },
        { path: '/impresoras', label: 'Impresoras' },
      ],
    },
    {
      title: 'Inventario',
      links: [
        { path: '/inventario/filamentos', label: 'Filamentos' },
        { path: '/inventario/insumos', label: 'Insumos y empaque' },
        { path: '/inventario/compras', label: 'Compras' },
        { path: '/inventario/movimientos', label: 'Kardex' },
      ],
    },
    {
      title: 'Finanzas',
      links: [
        { path: '/finanzas/cuentas', label: 'Cuentas' },
        { path: '/finanzas/movimientos', label: 'Caja' },
        { path: '/finanzas/por-cobrar', label: 'Por cobrar' },
        { path: '/finanzas/resultados', label: 'Resultados' },
      ],
    },
    { title: 'Ajustes', links: [{ path: '/configuracion', label: 'Configuración' }] },
  ];

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/login']);
  }
}
