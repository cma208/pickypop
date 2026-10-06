import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page, Thumb } from '../../ui';
import { CatalogoData } from './catalogo.data';
import {
  STATUS_LABELS,
  STATUS_TONES,
  type ProductStatus,
  type ProductSummary,
} from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { ProductoNuevo } from './producto-nuevo';

type StatusFilter = 'current' | 'all' | ProductStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'current', label: 'Vigentes (sin archivados)' },
  { value: 'draft', label: 'Borrador' },
  { value: 'published', label: 'Publicado' },
  { value: 'archived', label: 'Archivado' },
  { value: 'all', label: 'Todos' },
];

@Component({
  selector: 'app-catalogo',
  imports: [RouterLink, Page, AsyncState, Badge, Empty, Thumb, ProductoNuevo, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      .filters { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
      .product { display: block; padding: 1rem 1.25rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
      .product header { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem 0.75rem; }
      .product h2 { flex: 1; min-width: 12rem; margin: 0; font-size: 1.05rem; }
      .product h2 a { color: inherit; text-decoration: none; }
      .product h2 a:hover { text-decoration: underline; }
      .meta { display: flex; flex-wrap: wrap; gap: 0.4rem 0.5rem; align-items: center; margin: 0.4rem 0 0.6rem; font-size: 0.85rem; }
      .variants { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.2rem; font-size: 0.9rem; }
      .variants li { display: flex; align-items: center; gap: 0.5rem; }
      .variants li .grow { flex: 1; }
      .variants .off { opacity: 0.6; }
      @media (max-width: 30rem) { .filters { grid-template-columns: minmax(0, 1fr); } }
    `,
  ],
  template: `
    <pp-page title="Catálogo y recetas" subtitle="Productos, variantes, cómo se hace cada uno y a qué precio">
      <button actions type="button" (click)="creating.set(!creating())">
        {{ creating() ? 'Cerrar' : 'Nuevo producto' }}
      </button>

      @if (creating()) {
        <div class="stack" style="margin-bottom: 1.5rem">
          <app-producto-nuevo (cancelled)="creating.set(false)" />
        </div>
      }

      <div class="filters">
        <input
          type="search"
          aria-label="Buscar producto por nombre"
          placeholder="Buscar por nombre…"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
        <select
          aria-label="Filtrar por estado"
          (change)="filter.set($any($event.target).value)"
        >
          @for (option of filters; track option.value) {
            <option [value]="option.value" [selected]="option.value === filter()">{{ option.label }}</option>
          }
        </select>
      </div>

      <pp-async [loading]="loading()" [error]="loadError()">
        @if (actionError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (products().length === 0) {
          <pp-empty message="Todavía no hay productos en el catálogo.">
            <button type="button" (click)="creating.set(true)">Crear el primero</button>
          </pp-empty>
        } @else if (visible().length === 0) {
          <pp-empty message="Ningún producto coincide con la búsqueda o el filtro." />
        } @else {
          <div class="stack">
            @for (product of visible(); track product.id) {
              <article class="product">
                <header>
                  <pp-thumb size="row" kind="product" [path]="product.imagePath" [name]="product.name" />
                  <h2><a [routerLink]="['/catalogo', product.id]">{{ product.name }}</a></h2>
                  <pp-badge [tone]="tones[product.status]">{{ labels[product.status] }}</pp-badge>
                  <a class="button secondary" [routerLink]="['/catalogo', product.id]">Abrir ficha</a>
                  @if (product.status === 'archived') {
                    <button type="button" class="ghost" [disabled]="busyId() === product.id" (click)="restore(product)">
                      Restaurar
                    </button>
                  } @else {
                    <button type="button" class="ghost" [disabled]="busyId() === product.id" (click)="archive(product)">
                      Archivar
                    </button>
                  }
                </header>
                <div class="meta muted">
                  @if (product.category) { <span>{{ product.category }}</span> <span aria-hidden="true">·</span> }
                  <pp-badge [tone]="product.botVisible ? 'info' : 'neutral'">
                    {{ product.botVisible ? 'Visible para el bot' : 'Oculto para el bot' }}
                  </pp-badge>
                </div>
                @if (product.variants.length === 0) {
                  <p class="muted hint">Sin variantes todavía.</p>
                } @else {
                  <ul class="variants">
                    @for (variant of product.variants; track variant.id) {
                      <li [class.off]="!variant.active">
                        <pp-thumb
                          size="option"
                          kind="product"
                          [path]="variant.imagePath ?? product.imagePath"
                          [name]="variant.name"
                        />
                        <span class="grow">{{ variant.name }}@if (!variant.active) { <span class="muted"> (inactiva)</span> }</span>
                        <span class="num">{{ variant.listPrice | money }}</span>
                      </li>
                    }
                  </ul>
                }
              </article>
            }
          </div>
        }
      </pp-async>
    </pp-page>
  `,
})
export class CatalogoPage {
  private readonly data = inject(CatalogoData);

  protected readonly filters = FILTERS;
  protected readonly labels = STATUS_LABELS;
  protected readonly tones = STATUS_TONES;

  protected readonly products = signal<ProductSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly creating = signal(false);

  protected readonly search = signal('');
  protected readonly filter = signal<StatusFilter>('current');

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const filter = this.filter();

    return this.products().filter((product) => {
      const matchesName = product.name.toLowerCase().includes(term);
      const matchesStatus =
        filter === 'all' || (filter === 'current' ? product.status !== 'archived' : product.status === filter);
      return matchesName && matchesStatus;
    });
  });

  constructor() {
    void this.load();
  }

  protected async archive(product: ProductSummary): Promise<void> {
    const sure = confirm(
      `¿Archivar "${product.name}"? Dejará de mostrarse en el catálogo vigente. Puedes restaurarlo después.`,
    );
    if (sure) await this.changeStatus(product, 'archived');
  }

  protected restore(product: ProductSummary): Promise<void> {
    return this.changeStatus(product, 'draft');
  }

  private async changeStatus(product: ProductSummary, status: ProductStatus): Promise<void> {
    this.busyId.set(product.id);
    this.actionError.set(null);
    try {
      await this.data.setProductStatus(product.id, status);
      this.products.update((list) =>
        list.map((item) => (item.id === product.id ? { ...item, status } : item)),
      );
    } catch (error) {
      this.actionError.set(messageOf(error));
    } finally {
      this.busyId.set(null);
    }
  }

  private async load(): Promise<void> {
    try {
      this.products.set(await this.data.listProducts());
    } catch (error) {
      this.loadError.set(messageOf(error, 'No pudimos cargar el catálogo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
