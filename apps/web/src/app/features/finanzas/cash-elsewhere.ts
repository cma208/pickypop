import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TransactionType } from './finanzas.models';

/**
 * Money that looks like it belongs in Caja but has its own door. Typed here,
 * it is recorded without what the other door also records, and counts twice
 * once that door is used too. It informs and never blocks: a loose income or
 * a light bill do belong here.
 */
@Component({
  selector: 'app-cash-elsewhere',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styles: `
    :host { display: block; }
    p { margin: -0.4rem 0 0.9rem; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); background: var(--info-soft); font-size: var(--fs-sm); }
  `,
  template: `
    @switch (type()) {
      @case ('income') {
        <!--
          A sale typed here never left the shelf nor carried its cost, and the
          collection of an order typed here counts twice: once as the order's
          sale and again as other income (E5-01).
        -->
        <p>
          ¿Es una venta? Va por <a routerLink="/pedidos">Pedidos</a> o por la
          <a routerLink="/pedidos/venta-rapida">Venta rápida</a>, que sí sacan lo vendido del estante y llevan su
          costo. ¿Te pagaron un pedido? Se cobra desde el pedido o desde
          <a routerLink="/finanzas/por-cobrar">Por cobrar</a>: anotado aquí, contaría dos veces.
        </p>
      }
      @case ('expense') {
        <!--
          A purchase typed here leaves its supplies without a cost, so they go
          into every product at zero. And paid later from Compras, which writes
          its own expense, the same money leaves twice.
        -->
        <p>
          ¿Es una compra de filamento, insumos o empaque? Regístrala en
          <a routerLink="/inventario/compras">Compras</a>: así queda su costo y no se cuenta dos veces.
        </p>
      }
    }
  `,
})
export class CashElsewhere {
  readonly type = input.required<TransactionType>();
}
