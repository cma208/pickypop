import { Component, effect, inject, input, output, signal, untracked, type OnInit } from '@angular/core';
import { AsyncState } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { CostContext, Lookups, Variant } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { CostoVariante } from './costo-variante';
import { EscaleraPrecios } from './escalera-precios';
import { RecetaEditor } from './receta-editor';
import { VarianteForm } from './variante-form';
import { VariantCostModel } from './variant-cost.model';

/**
 * Everything about one variant: its data, recipe, price ladder and cost.
 * The parent recreates it when another variant is selected.
 */
@Component({
  selector: 'app-variante-detalle',
  imports: [AsyncState, VarianteForm, RecetaEditor, EscaleraPrecios, CostoVariante],
  providers: [VariantCostModel],
  styles: SHARED_STYLES,
  template: `
    <div class="stack">
      <app-variante-form
        [productId]="variant().productId"
        [productSlug]="productSlug()"
        [variant]="variant()"
        (saved)="variantSaved.emit()"
        (removed)="variantRemoved.emit()"
        (duplicated)="variantSaved.emit()"
      />

      <pp-async [loading]="loading()" [error]="loadError()">
        <app-receta-editor
          [variantId]="variant().id"
          [recipe]="model.recipe()"
          [lookups]="lookups()"
          [lookupsError]="lookupsError()"
          [lookupsRefreshError]="lookupsRefreshError()"
          [laborRate]="model.profile()?.laborRatePerHour ?? null"
          (changed)="reloadRecipe()"
          (itemsChanged)="itemsChanged.emit()"
        />
        <div class="stack" style="margin-top: 1rem">
          <app-escalera-precios [variantId]="variant().id" (changed)="reloadTiers()" />
          <app-costo-variante />
        </div>
      </pp-async>
    </div>
  `,
})
export class VarianteDetalle implements OnInit {
  private readonly data = inject(CatalogoData);
  protected readonly model = inject(VariantCostModel);

  readonly variant = input.required<Variant>();
  /** Only used to suggest an internal code. */
  readonly productSlug = input<string>('');
  readonly lookups = input<Lookups | null>(null);
  readonly lookupsError = input<string | null>(null);
  /** A refresh of the options that failed; it warns without taking the recipe away. */
  readonly lookupsRefreshError = input<string | null>(null);
  readonly context = input<CostContext | null>(null);
  /** The variant data changed (saved); the parent should reload its list. */
  readonly variantSaved = output<void>();
  readonly variantRemoved = output<void>();
  /** Parts or supplies were created here; the page owns the options and must read them again. */
  readonly itemsChanged = output<void>();

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const variant = this.variant();
      const lookups = this.lookups();
      const context = this.context();
      untracked(() => {
        this.model.variant.set(variant);
        this.model.lookups.set(lookups);
        this.model.context.set(context);
      });
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async reloadRecipe(): Promise<void> {
    try {
      this.model.recipe.set(await this.data.getRecipe(this.variant().id));
    } catch (error) {
      this.loadError.set(messageOf(error, 'No pudimos actualizar la receta.'));
    }
  }

  protected async reloadTiers(): Promise<void> {
    try {
      this.model.tiers.set(await this.data.listTiers(this.variant().id));
    } catch (error) {
      this.loadError.set(messageOf(error, 'No pudimos actualizar la escalera de precios.'));
    }
  }

  private async load(): Promise<void> {
    try {
      const id = this.variant().id;
      const [recipe, tiers] = await Promise.all([this.data.getRecipe(id), this.data.listTiers(id)]);
      this.model.recipe.set(recipe);
      this.model.tiers.set(tiers);
    } catch (error) {
      this.loadError.set(messageOf(error, 'No pudimos cargar la receta y los precios.'));
    } finally {
      this.loading.set(false);
    }
  }
}
