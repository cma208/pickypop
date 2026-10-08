import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';

/** One active recipe that uses a printed part: as a component, as what a plate prints, or both. */
export interface PartUse {
  /** «Calavera dulcera · Con dulces surtidos». */
  product: string;
  /** Numbers of the recipe's plates that print the part. */
  plates: number[];
  /** How many one product takes, when the recipe lists it. */
  perUnit: number | null;
}

interface RecipeRef {
  active: boolean;
  product_variants: { name: string; catalog_products: { name: string } | null } | null;
}

/**
 * Which recipes use a printed part. Switching a part off takes it out of the
 * pickers and the shelf count, but every recipe that asks for it keeps asking,
 * and before this the piece went off with a «Cambios guardados.» (T2-13).
 */
@Injectable({ providedIn: 'root' })
export class PartRecipes {
  private readonly supabase = inject(SUPABASE);

  async uses(partId: string): Promise<PartUse[]> {
    const [items, outputs] = await Promise.all([
      this.supabase
        .from('recipe_items')
        .select('recipe_id, quantity_per_unit, recipes!inner(active, product_variants(name, catalog_products(name)))')
        .eq('inventory_item_id', partId),
      this.supabase
        .from('recipe_plate_outputs')
        .select('recipe_plates!inner(recipe_id, plate_index, recipes!inner(active, product_variants(name, catalog_products(name))))')
        .eq('inventory_item_id', partId),
    ]);
    if (items.error) throw items.error;
    if (outputs.error) throw outputs.error;

    const uses = new Map<string, PartUse>();
    const use = (recipeId: string, ref: RecipeRef): PartUse => {
      const found = uses.get(recipeId) ?? { product: productName(ref), plates: [], perUnit: null };
      uses.set(recipeId, found);
      return found;
    };
    for (const row of items.data as unknown as { recipe_id: string; quantity_per_unit: number; recipes: RecipeRef }[]) {
      if (row.recipes.active) use(row.recipe_id, row.recipes).perUnit = Number(row.quantity_per_unit);
    }
    for (const row of outputs.data as unknown as {
      recipe_plates: { recipe_id: string; plate_index: number; recipes: RecipeRef };
    }[]) {
      const plate = row.recipe_plates;
      if (plate.recipes.active) use(plate.recipe_id, plate.recipes).plates.push(plate.plate_index);
    }
    return [...uses.values()]
      .map((found) => ({ ...found, plates: [...found.plates].sort((a, b) => a - b) }))
      .sort((a, b) => a.product.localeCompare(b.product, 'es'));
  }
}

function productName(ref: RecipeRef): string {
  const variant = ref.product_variants;
  return [variant?.catalog_products?.name, variant?.name].filter(Boolean).join(' · ') || 'Una receta';
}

/** «Calavera dulcera · Con dulces surtidos (sale de la placa 1)», each recipe as a person reads it. */
export function describeUses(uses: readonly PartUse[]): string {
  const items = uses.map((use) => {
    if (use.plates.length === 0) return use.product;
    const plates = use.plates.length === 1 ? `la placa ${use.plates[0]}` : `las placas ${use.plates.join(', ')}`;
    return `${use.product} (sale de ${plates})`;
  });
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** What the edit form says before a used part is switched off, or null when no recipe uses it. */
export function deactivationWarning(partName: string, uses: readonly PartUse[]): string | null {
  if (uses.length === 0) return null;
  const many = uses.length > 1;
  return (
    `«${partName}» la ${many ? 'usan las recetas de' : 'usa la receta de'} ${describeUses(uses)}. ` +
    'Si la desactivas, deja de ofrecerse al elegir piezas y sale del conteo del estante, pero ' +
    `${many ? 'esas recetas la siguen pidiendo' : 'esa receta la sigue pidiendo'}, y donde sale de una placa, la placa la sigue imprimiendo.`
  );
}

/** What the page says once a used part was switched off. */
export function deactivatedNote(partName: string, uses: readonly PartUse[]): string {
  if (uses.length === 0) return 'Cambios guardados.';
  return (
    `«${partName}» quedó desactivada, y la siguen usando: ${describeUses(uses)}. ` +
    'Si fue un error, vuelve a activarla abajo, en «Desactivadas».'
  );
}
