import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AsyncState, Badge, Empty, Page } from '../../ui';
import { CatalogoData } from './catalogo.data';
import {
  STATUS_LABELS,
  STATUS_TONES,
  type CostContext,
  type Lookups,
  type ProductDetail,
  type Variant,
} from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { ProductoDatos } from './producto-datos';
import { VarianteDetalle } from './variante-detalle';
import { VarianteForm } from './variante-form';

/** Product sheet: data, technical sheet, variants and, per variant, recipe, prices and cost. */
@Component({
  selector: 'app-producto',
  imports: [RouterLink, Page, Badge, AsyncState, Empty, ProductoDatos, VarianteForm, VarianteDetalle],
  styles: [
    SHARED_STYLES,
    `
      .tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
      .tabs button[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
      .tabs .off { opacity: 0.65; }
      h2.section { margin: 2rem 0 0.75rem; font-size: 1.1rem; }
      /* Una variante con receta larga y otra sin receta tienen alturas muy
         distintas, y al cambiar de pestaña la página se desplomaba y volvía a
         crecer: un salto que se lee como un error. Reservar el alto hace que
         el contenido cambie y el resto se quede quieto. */
      .variant-area { min-height: 32rem; }
    `,
  ],
  template: `
    <pp-page [title]="product()?.name ?? 'Producto'" [subtitle]="product() ? 'Ficha del producto' : undefined">
      <a actions class="button secondary" [routerLink]="['/catalogo']">Volver al catálogo</a>

      <pp-async [loading]="loading()" [error]="loadError()">
        @if (product(); as current) {
          <div class="row" style="margin-bottom: 1rem">
            <pp-badge [tone]="tones[current.status]">{{ labels[current.status] }}</pp-badge>
            <span class="muted hint">/{{ current.slug }}</span>
          </div>

          <app-producto-datos [product]="current" (saved)="reloadProduct()" />

          <h2 class="section">Variantes</h2>
          @if (variants().length === 0 && !creating()) {
            <pp-empty message="Este producto todavía no tiene variantes. Crea la primera para definir su receta y sus precios.">
              <button type="button" (click)="creating.set(true)">Crear variante</button>
            </pp-empty>
          } @else {
            <div class="tabs" role="group" aria-label="Variantes del producto">
              @for (variant of variants(); track variant.id) {
                <button
                  type="button"
                  class="secondary"
                  [class.off]="!variant.active"
                  [attr.aria-pressed]="!creating() && variant.id === selected()?.id"
                  (click)="select(variant.id)"
                >
                  {{ variant.name }}{{ variant.active ? '' : ' (inactiva)' }}
                </button>
              }
              <button type="button" class="ghost" [attr.aria-pressed]="creating()" (click)="creating.set(true)">+ Nueva variante</button>
            </div>
          }

          <div class="variant-area">
          @if (creating()) {
            <app-variante-form
              [productId]="current.id"
              [productSlug]="current.slug"
              (saved)="variantCreated($event)"
              (cancelled)="creating.set(false)"
            />
          } @else {
            @for (variant of selectedList(); track variant.id) {
              <app-variante-detalle
                [variant]="variant"
                [productSlug]="current.slug"
                [lookups]="lookups()"
                [lookupsError]="lookupsError()"
                [context]="context()"
                (variantSaved)="reloadVariants()"
                (variantRemoved)="variantRemoved()"
                (itemsChanged)="reloadLookups()"
              />
            }
          }
          </div>
        } @else if (!loading()) {
          <pp-empty message="No encontramos este producto. Puede que ya no exista.">
            <a class="button secondary" [routerLink]="['/catalogo']">Volver al catálogo</a>
          </pp-empty>
        }
      </pp-async>
    </pp-page>
  `,
})
export class ProductoPage {
  private readonly data = inject(CatalogoData);

  /** Route parameter `:id`. */
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  protected readonly id = computed(() => this.params()?.get('id') ?? '');

  protected readonly labels = STATUS_LABELS;
  protected readonly tones = STATUS_TONES;

  protected readonly product = signal<ProductDetail | null>(null);
  protected readonly variants = signal<Variant[]>([]);
  protected readonly lookups = signal<Lookups | null>(null);
  protected readonly context = signal<CostContext | null>(null);
  protected readonly lookupsError = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly creating = signal(false);
  private readonly selectedId = signal<string | null>(null);

  protected readonly selected = computed(() => {
    const list = this.variants();
    return list.find((variant) => variant.id === this.selectedId()) ?? list[0] ?? null;
  });
  /** A one-item list lets @for recreate the detail when the variant changes. */
  protected readonly selectedList = computed(() => {
    const selected = this.selected();
    return selected ? [selected] : [];
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) untracked(() => void this.load(id));
    });
  }

  protected select(id: string): void {
    this.creating.set(false);
    this.selectedId.set(id);
  }

  protected async reloadProduct(): Promise<void> {
    try {
      this.product.set(await this.data.getProduct(this.id()));
    } catch (error) {
      this.loadError.set(messageOf(error, 'No pudimos actualizar el producto.'));
    }
  }

  protected async reloadVariants(): Promise<void> {
    try {
      this.variants.set(await this.data.listVariants(this.id()));
    } catch (error) {
      this.loadError.set(messageOf(error, 'No pudimos actualizar las variantes.'));
    }
  }

  /**
   * The parts and supplies the recipe offers, read again after an import
   * created parts. They were read once with the page, and a part made a
   * moment ago had no name in the recipe until the page was reloaded (E2-01).
   */
  protected async reloadLookups(): Promise<void> {
    try {
      this.lookups.set(await this.data.lookups());
    } catch (error) {
      this.lookupsError.set(messageOf(error, 'No pudimos actualizar las piezas e insumos del taller. Recarga la página.'));
    }
  }

  protected async variantCreated(id: string): Promise<void> {
    await this.reloadVariants();
    this.selectedId.set(id);
    this.creating.set(false);
  }

  protected async variantRemoved(): Promise<void> {
    this.selectedId.set(null);
    await this.reloadVariants();
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [product, variants] = await Promise.all([this.data.getProduct(id), this.data.listVariants(id)]);
      this.product.set(product);
      this.variants.set(variants);
    } catch (error) {
      this.loadError.set(messageOf(error, 'No pudimos cargar el producto.'));
    } finally {
      this.loading.set(false);
    }

    // Costing sources are secondary: the sheet is usable even if they fail.
    try {
      const [lookups, context] = await Promise.all([this.data.lookups(), this.data.costContext()]);
      this.lookups.set(lookups);
      this.context.set(context);
    } catch (error) {
      this.lookupsError.set(messageOf(error, 'No pudimos cargar los costos del taller.'));
    }
  }
}
