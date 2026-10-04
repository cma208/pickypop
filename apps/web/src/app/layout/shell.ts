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

  protected readonly groups: NavGroup[] = [
    { title: 'Taller', links: [{ path: '/panel', label: 'Panel' }] },
    {
      title: 'Inventario',
      links: [
        { path: '/inventario/filamentos', label: 'Filamentos' },
        { path: '/inventario/rollos', label: 'Rollos' },
        { path: '/inventario/compras', label: 'Compras' },
        { path: '/inventario/insumos', label: 'Insumos y repuestos' },
        { path: '/inventario/movimientos', label: 'Movimientos' },
      ],
    },
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
        { path: '/catalogo', label: 'Catálogo' },
        { path: '/produccion', label: 'Impresiones' },
        { path: '/impresoras', label: 'Impresoras' },
      ],
    },
    { title: 'Ajustes', links: [{ path: '/configuracion', label: 'Configuración' }] },
  ];

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/login']);
  }
}
