import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session } from '../core/session';
import { Appearance } from '../core/appearance';
import { NavIcons } from './nav-icons';

interface NavLink {
  path: string;
  label: string;
  /** Id of a symbol in NAV_ICON_SPRITE, without the hash. */
  icon: string;
}

interface NavGroup {
  title: string;
  links: NavLink[];
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NavIcons],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly appearance = inject(Appearance);
  protected readonly session = inject(Session);

  /** The slide-over on a phone. Separate from the rail, which is for wide screens. */
  protected readonly menuOpen = signal(false);
  protected readonly collapsed = signal(this.appearance.settings().sidebarCollapsed);

  /**
   * Grouped by the part of the business you are in, not by the part of the
   * system. Nouns, which is the convention everywhere else (Odoo, ERPNext,
   * Shopify) and what the owner asked for. Entries only appear once their
   * screen exists: a link to an empty page is worse than no link.
   */
  protected readonly groups: NavGroup[] = [
    { title: 'Taller', links: [{ path: '/hoy', label: 'Hoy', icon: 'ic-today' }] },
    {
      title: 'Ventas',
      links: [
        { path: '/oportunidades', label: 'Oportunidades', icon: 'ic-funnel' },
        { path: '/cotizador', label: 'Cotizador', icon: 'ic-calculator' },
        { path: '/cotizaciones', label: 'Cotizaciones', icon: 'ic-doc' },
        { path: '/pedidos', label: 'Pedidos', icon: 'ic-bag' },
        { path: '/clientes', label: 'Clientes', icon: 'ic-users' },
      ],
    },
    {
      title: 'Producción',
      links: [
        { path: '/produccion', label: 'Cola de impresión', icon: 'ic-layers' },
        { path: '/catalogo', label: 'Catálogo y recetas', icon: 'ic-grid' },
        { path: '/impresoras', label: 'Impresoras', icon: 'ic-printer' },
      ],
    },
    {
      title: 'Inventario',
      links: [
        { path: '/inventario/filamentos', label: 'Filamentos', icon: 'ic-spool' },
        { path: '/inventario/insumos', label: 'Insumos y empaque', icon: 'ic-box' },
        { path: '/inventario/compras', label: 'Compras', icon: 'ic-cart' },
        { path: '/inventario/movimientos', label: 'Kardex', icon: 'ic-ledger' },
      ],
    },
    {
      title: 'Finanzas',
      links: [
        { path: '/finanzas/cuentas', label: 'Cuentas', icon: 'ic-wallet' },
        { path: '/finanzas/movimientos', label: 'Caja', icon: 'ic-cash' },
        { path: '/finanzas/por-cobrar', label: 'Por cobrar', icon: 'ic-clock' },
        { path: '/finanzas/resultados', label: 'Resultados', icon: 'ic-chart' },
      ],
    },
    { title: 'Ajustes', links: [{ path: '/configuracion', label: 'Configuración', icon: 'ic-sliders' }] },
  ];

  /** Collapsing is a direct action, so it is remembered on the spot. */
  protected toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    this.appearance.setSidebarCollapsed(next);
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/login']);
  }
}
