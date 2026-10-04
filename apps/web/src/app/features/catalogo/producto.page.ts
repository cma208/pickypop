import { Component } from '@angular/core';
import { Page } from '../../ui';

@Component({
  selector: 'app-producto.page',
  imports: [Page],
  template: `
    <pp-page title="Producto" subtitle="Pantalla pendiente de construir">
      <p class="muted">Aquí va Producto.</p>
    </pp-page>
  `,
})
export class ProductoPage {}
