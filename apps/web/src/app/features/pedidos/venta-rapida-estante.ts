import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, Empty, FORMAT_PIPES, Thumb } from '../../ui';
import { freeUnits, type ShelfOffer } from './quick-sale';

/**
 * What can be sold now, by its photo: every assembled product with units
 * nobody claims. Tapping one adds a unit to the sale, up to what is free.
 * What is not here goes through a normal order, and the screen says so.
 */
@Component({
  selector: 'app-venta-rapida-estante',
  imports: [RouterLink, Badge, Empty, Thumb, ...FORMAT_PIPES],
  template: `
    @if (offers().length === 0) {
      <pp-empty message="No hay nada armado y libre en el estante.">
        <div class="row center">
          <a class="button secondary" routerLink="/inventario/armar">Armar productos</a>
          <a class="button secondary" routerLink="/pedidos/nuevo">Nuevo pedido</a>
        </div>
      </pp-empty>
    } @else {
      <div class="offers">
        @for (offer of offers(); track offer.id) {
          @let taken = inSale().get(offer.id) ?? 0;
          <button
            type="button"
            class="offer"
            [class.chosen]="taken > 0"
            [disabled]="taken >= offer.free"
            [attr.aria-label]="'Agregar ' + offer.label"
            (click)="add.emit(offer)"
          >
            <pp-thumb size="fill" kind="product" [path]="offer.imagePath" [name]="offer.productName" />
            <span class="name">{{ offer.productName }}</span>
            <span class="variant muted">{{ offer.variantName }}</span>
            <span class="meta">
              <span class="price">{{ offer.listPrice === null ? 'Sin precio' : (offer.listPrice | money) }}</span>
              <pp-badge [tone]="taken >= offer.free ? 'neutral' : 'good'">{{ free(offer) }}</pp-badge>
            </span>
            @if (taken > 0) {
              <span class="taken">{{ taken >= offer.free ? 'Todas en la venta' : taken + ' en la venta' }}</span>
            }
          </button>
        }
      </div>
    }
    <p class="muted more">
      ¿Falta algo? Lo que no está armado y libre en el estante va por un
      <a routerLink="/pedidos/nuevo">pedido normal</a>, que lo separa y lo manda a producir.
    </p>
  `,
  styles: `
    :host { display: block; }
    .offers { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.75rem; }
    .offer {
      display: grid; justify-items: start; align-content: start; gap: 0.25rem;
      min-height: 0; padding: 0.6rem; border: 1.5px solid var(--line); border-radius: var(--radius);
      background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .offer:hover:not(:disabled) { border-color: var(--muted); }
    .offer.chosen { border-color: var(--accent); background: var(--accent-soft); }
    .offer:disabled { opacity: 0.7; }
    .name { font-weight: 600; line-height: 1.25; }
    .variant { font-size: var(--fs-sm); }
    .meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.25rem; width: 100%; }
    .price { font-variant-numeric: tabular-nums; font-size: var(--fs-sm); }
    .taken { font-size: var(--fs-xs); font-weight: 600; color: var(--accent); }
    .more { margin: 0.9rem 0 0; font-size: var(--fs-sm); }
    .center { justify-content: center; }
  `,
})
export class VentaRapidaEstante {
  readonly offers = input.required<ShelfOffer[]>();
  /** Units of each product already in the sale. */
  readonly inSale = input.required<ReadonlyMap<string, number>>();
  readonly add = output<ShelfOffer>();

  protected free(offer: ShelfOffer): string {
    return freeUnits(offer.free);
  }
}
