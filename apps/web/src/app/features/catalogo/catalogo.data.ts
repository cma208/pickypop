import { inject, Injectable } from '@angular/core';
import type { PostgrestError } from '@supabase/supabase-js';
import { todayLocal } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { fetchAll } from '../../core/fetch-all';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace, isOwnerRole } from '../../core/workspace';
import { Media } from '../../core/media';
import type { CostProfile, PrinterProfile } from '../../core/pricing';
import type { Json } from '../../core/database.types';
import type {
  CostContext,
  ImportedPlate,
  ImportResult,
  Lookups,
  Pair,
  PlateOutputInput,
  PriceTierRow,
  PrinterOption,
  ProductDetail,
  ProductInput,
  ProductStatus,
  ProductSummary,
  Recipe,
  RecipeFilament,
  RecipeFilamentInput,
  RecipeHeaderInput,
  RecipePlateInput,
  SkuOption,
  Variant,
  VariantInput,
  VariantUsage,
} from './catalogo.models';
import { supplyOptions } from './costing';
import { learnedParts, recordFromJson, recordToJson } from './importacion';
import { OWNER_ONLY } from './catalogo.permissions';
import { blankToNull, CatalogoError } from './catalogo.util';

const GRAMS_PER_KG = 1000;
/** Enough past imports to remember every object name the workshop uses. */
const LEARNED_PLATES_LIMIT = 500;

const PG_UNIQUE = '23505';

/**
 * The unique rules of the catalogue whose clash a person can act on, by the
 * name the database gives them. A product has two (its name and its slug),
 * and «ya hay uno con ese slug» for a repeated name sent the person to fix
 * the wrong field.
 */
const DUPLICATES: Record<string, string> = {
  catalog_products_name_key: 'Ya hay un producto con ese nombre.',
  catalog_products_workspace_id_slug_key: 'Ya hay un producto con ese identificador (slug).',
  product_variants_name_key: 'Ya hay una variante con ese nombre en este producto.',
  product_variants_workspace_id_product_id_name_key: 'Ya hay una variante con ese nombre en este producto.',
  recipes_one_active_per_variant: 'Esta variante ya tiene receta: se creó hace un momento. Recarga la página para verla.',
};

/**
 * An update or a delete that finds no row comes back without an error: the
 * row is gone, or Row Level Security did not let it be touched. Said
 * nothing, the screen reloaded as if it had worked (T2-10).
 */
const GONE = 'Eso ya no está: lo quitaron o lo cambiaron en otra pestaña. Recarga la página.';

/**
 * Turns a database error into a message a person can act on. Only the
 * repeated names are the catalogue's own; the rest is said as everywhere
 * else (`friendlyError`): a `raise exception` word for word, a permission,
 * a number too large with how large it may be, the network. The error goes
 * along as the cause, so a screen can tell a refusal of the role.
 */
function fail(error: PostgrestError, fallback: string, duplicate?: string): never {
  if (error.code === PG_UNIQUE) {
    const known = Object.keys(DUPLICATES).find((name) => error.message.includes(`"${name}"`));
    if (known) throw new CatalogoError(DUPLICATES[known]!, { cause: error });
    if (duplicate) throw new CatalogoError(duplicate, { cause: error });
  }
  throw new CatalogoError(friendlyError(error, fallback), { cause: error });
}

function toPairs(json: Json | undefined): Pair[] {
  if (json === null || json === undefined || typeof json !== 'object' || Array.isArray(json)) {
    return [];
  }
  return Object.entries(json).map(([name, value]) => ({
    name,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function fromPairs(pairs: Pair[] | undefined): Record<string, string> {
  return Object.fromEntries((pairs ?? []).map((pair) => [pair.name, pair.value]));
}

function numberOrNull(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** An update that found no row: the row is gone (every member may edit the catalogue). */
function changed(rows: unknown[] | null): void {
  if (!rows || rows.length === 0) throw new CatalogoError(GONE);
}

/** Everything the catalogue screens read and write. Pages never touch Supabase. */
@Injectable({ providedIn: 'root' })
export class CatalogoData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly media = inject(Media);

  /** Rows are created inside the person's workshop; RLS keeps it that way. */
  private workspaceId(): Promise<string> {
    return this.workspace.requireId();
  }

  // ---------------------------------------------------------------- products

  async listProducts(): Promise<ProductSummary[]> {
    const { data, error } = await this.supabase
      .from('catalog_products')
      .select(
        'id, name, slug, status, bot_visible, lead_time_days, category, image_path, product_variants(id, name, list_price, active, image_path)',
      )
      .order('name');
    if (error) fail(error, 'No pudimos cargar el catálogo.');

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      botVisible: row.bot_visible,
      leadTimeDays: row.lead_time_days,
      category: row.category,
      imagePath: row.image_path,
      variants: row.product_variants
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          listPrice: numberOrNull(variant.list_price),
          active: variant.active,
          imagePath: variant.image_path,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    }));
  }

  async getProduct(id: string): Promise<ProductDetail | null> {
    const { data, error } = await this.supabase
      .from('catalog_products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) fail(error, 'No pudimos cargar el producto.');
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description ?? '',
      category: data.category ?? '',
      tags: data.tags,
      status: data.status,
      botVisible: data.bot_visible,
      leadTimeDays: data.lead_time_days,
      imagePath: data.image_path,
      specs: toPairs(data.specs),
    };
  }

  async createProduct(input: ProductInput): Promise<string> {
    const { data, error } = await this.supabase
      .from('catalog_products')
      .insert({
        workspace_id: await this.workspaceId(),
        name: input.name.trim(),
        slug: input.slug,
        description: blankToNull(input.description),
        category: blankToNull(input.category),
        tags: input.tags,
        lead_time_days: input.leadTimeDays,
        specs: fromPairs(input.specs),
      })
      .select('id')
      .single();
    if (error) {
      fail(error, 'No pudimos crear el producto.', 'Ya hay un producto con ese identificador (slug).');
    }
    return data.id;
  }

  async updateProduct(id: string, input: ProductInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('catalog_products')
      .update({
        name: input.name.trim(),
        slug: input.slug,
        description: blankToNull(input.description),
        category: blankToNull(input.category),
        tags: input.tags,
        lead_time_days: input.leadTimeDays,
        ...(input.imagePath === undefined ? {} : { image_path: input.imagePath }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.botVisible === undefined ? {} : { bot_visible: input.botVisible }),
        specs: fromPairs(input.specs),
      })
      .eq('id', id)
      .select('id');
    if (error) {
      fail(error, 'No pudimos guardar el producto.', 'Ya hay un producto con ese identificador (slug).');
    }
    changed(data);
  }

  /** Names of the workshop's products, archived ones too, to warn about a repeated one before saving. */
  async productNames(): Promise<{ id: string; name: string; status: ProductStatus }[]> {
    const { data, error } = await this.supabase.from('catalog_products').select('id, name, status');
    if (error) fail(error, 'No pudimos leer los productos.');
    return data;
  }

  /**
   * The picture saves on its own, without the form around it. Choosing a photo
   * is a complete thought: making it wait for Guardar is how a photo gets
   * uploaded and then lost.
   */
  async setProductImage(id: string, imagePath: string | null): Promise<void> {
    const { data, error } = await this.supabase
      .from('catalog_products')
      .update({ image_path: imagePath })
      .eq('id', id)
      .select('id');
    if (error) fail(error, 'No pudimos guardar la foto.');
    changed(data);
  }

  async setVariantImage(id: string, imagePath: string | null): Promise<void> {
    const { data, error } = await this.supabase
      .from('product_variants')
      .update({ image_path: imagePath })
      .eq('id', id)
      .select('id');
    if (error) fail(error, 'No pudimos guardar la foto.');
    changed(data);
  }

  async setProductStatus(id: string, status: ProductStatus): Promise<void> {
    const { data, error } = await this.supabase.from('catalog_products').update({ status }).eq('id', id).select('id');
    if (error) fail(error, 'No pudimos cambiar el estado del producto.');
    changed(data);
  }

  // ---------------------------------------------------------------- variants

  async listVariants(productId: string): Promise<Variant[]> {
    const { data, error } = await this.supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('created_at');
    if (error) fail(error, 'No pudimos cargar las variantes.');

    return data.map((row) => ({
      id: row.id,
      productId: row.product_id,
      name: row.name,
      options: toPairs(row.options),
      skuCode: row.sku_code,
      listPrice: numberOrNull(row.list_price),
      minOrderUnits: row.min_order_units,
      active: row.active,
      imagePath: row.image_path,
    }));
  }

  async createVariant(productId: string, input: VariantInput): Promise<string> {
    const { data, error } = await this.supabase
      .from('product_variants')
      .insert({ workspace_id: await this.workspaceId(), product_id: productId, ...this.variantRow(input) })
      .select('id')
      .single();
    if (error) {
      fail(error, 'No pudimos crear la variante.', 'Ya hay una variante con ese nombre en este producto.');
    }
    return data.id;
  }

  async updateVariant(id: string, input: VariantInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('product_variants')
      .update(this.variantRow(input))
      .eq('id', id)
      .select('id');
    if (error) {
      fail(error, 'No pudimos guardar la variante.', 'Ya hay una variante con ese nombre en este producto.');
    }
    changed(data);
  }

  /** Switching a variant off is how one that is already sold leaves the catalogue. */
  async setVariantActive(id: string, active: boolean): Promise<void> {
    const { data, error } = await this.supabase.from('product_variants').update({ active }).eq('id', id).select('id');
    if (error) fail(error, 'No pudimos cambiar la variante.');
    changed(data);
  }

  /**
   * Where the variant is used, as the database counts it: the same function
   * refuses to delete it while it is in a quote, an order or the inventory.
   */
  async variantUsage(id: string): Promise<VariantUsage> {
    const { data, error } = await this.supabase.rpc('variant_usage', { p_variant_id: id });
    if (error) fail(error, 'No pudimos ver dónde se usa la variante.');
    const usage = (data ?? {}) as Record<string, unknown>;
    return {
      quotes: Number(usage['quotes'] ?? 0),
      orders: Number(usage['orders'] ?? 0),
      shelf: Number(usage['shelf'] ?? 0),
      openQuotes: Number(usage['open_quotes'] ?? 0),
      openOrders: Number(usage['open_orders'] ?? 0),
      onHand: Number(usage['on_hand'] ?? 0),
    };
  }

  /**
   * Copies a variant whole: recipe, plates, filaments, supplies and price
   * ladder. The database does it in one go, because a half-copied variant —
   * one with half a recipe — is worse than no copy at all.
   */
  async duplicateVariant(id: string, name: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('duplicate_variant', { p_variant_id: id, p_name: name });
    if (error) fail(error, 'No pudimos duplicar la variante.');
    return data;
  }

  /**
   * Deleting a variant also deletes its recipe and its price tiers. The
   * database refuses one that a quote, an order or the inventory uses, and
   * says where (T2-01): that one is switched off instead.
   */
  async deleteVariant(id: string): Promise<void> {
    const { data, error } = await this.supabase.from('product_variants').delete().eq('id', id).select('id');
    if (error) fail(error, 'No pudimos eliminar la variante.');
    await this.removed(data, OWNER_ONLY.variant);
  }

  private variantRow(input: VariantInput) {
    return {
      name: input.name.trim(),
      options: fromPairs(input.options),
      sku_code: blankToNull(input.skuCode),
      list_price: input.listPrice,
      min_order_units: input.minOrderUnits,
      active: input.active,
      image_path: input.imagePath,
    };
  }

  // ----------------------------------------------------------------- recipes

  /** The active recipe with the highest version, with its plates and supplies. */
  async getRecipe(variantId: string): Promise<Recipe | null> {
    const { data: recipes, error } = await this.supabase
      .from('recipes')
      .select('*')
      .eq('variant_id', variantId)
      .eq('active', true)
      .order('version', { ascending: false })
      .limit(1);
    if (error) fail(error, 'No pudimos cargar la receta.');

    const recipe = recipes[0];
    if (!recipe) return null;

    const [plates, items] = await Promise.all([
      this.supabase
        .from('recipe_plates')
        .select('*, recipe_plate_filaments(*), recipe_plate_outputs(*, inventory_items(name, image_path, active))')
        .eq('recipe_id', recipe.id)
        .order('plate_index'),
      this.supabase
        .from('recipe_items')
        .select('id, inventory_item_id, quantity_per_unit, inventory_items(kind, name, unit, image_path, active)')
        .eq('recipe_id', recipe.id)
        .order('created_at'),
    ]);
    if (plates.error) fail(plates.error, 'No pudimos cargar las placas de la receta.');
    if (items.error) fail(items.error, 'No pudimos cargar los insumos de la receta.');

    return {
      id: recipe.id,
      variantId: recipe.variant_id,
      version: recipe.version,
      setupMinutes: Number(recipe.setup_minutes),
      minutesPerUnit: Number(recipe.minutes_per_unit),
      note: recipe.note,
      assembled: recipe.assembled,
      plates: plates.data.map((plate) => ({
        id: plate.id,
        label: plate.label,
        plateIndex: plate.plate_index,
        unitsPerRun: Number(plate.units_per_run),
        outputs: [...plate.recipe_plate_outputs]
          .sort((a, b) => a.position - b.position)
          .map((output) => ({
            id: output.id,
            inventoryItemId: output.inventory_item_id,
            unitsPerRun: Number(output.units_per_run),
            ...(output.inventory_items
              ? {
                  part: {
                    name: output.inventory_items.name,
                    imagePath: output.inventory_items.image_path,
                    active: output.inventory_items.active,
                  },
                }
              : {}),
          })),
        printTimeS: plate.print_time_s,
        thumbnailPath: plate.thumbnail_path,
        sourceFileName: plate.source_file_name,
        fileRecord: recordFromJson(plate.slicer_metadata),
        filaments: plate.recipe_plate_filaments
          .map(
            (filament): RecipeFilament => ({
              id: filament.id,
              slot: filament.slot,
              materialId: filament.material_id,
              colorHex: filament.color_hex,
              skuId: filament.filament_sku_id,
              grams: Number(filament.grams),
            }),
          )
          .sort((a, b) => a.slot - b.slot),
      })),
      supplies: items.data.map((item) => ({
        id: item.id,
        inventoryItemId: item.inventory_item_id,
        quantityPerUnit: Number(item.quantity_per_unit),
        item: {
          // The foreign key makes the item always there; the fallback only
          // keeps a row readable if a policy ever hid it.
          kind: item.inventory_items?.kind ?? 'supply',
          name: item.inventory_items?.name ?? 'Artículo',
          unit: item.inventory_items?.unit ?? '',
          imagePath: item.inventory_items?.image_path ?? null,
          active: item.inventory_items?.active ?? true,
        },
      })),
    };
  }

  /**
   * The database numbers the version and refuses a variant that already has
   * a recipe, in one step: reading the last version here and inserting the
   * next one let two tabs create versions 1 and 2, both active (T2-02).
   */
  async createRecipe(variantId: string): Promise<void> {
    const { error } = await this.supabase.rpc('create_recipe', { p_variant_id: variantId });
    if (error) fail(error, 'No pudimos crear la receta.');
  }

  async updateRecipe(id: string, input: RecipeHeaderInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('recipes')
      .update({
        setup_minutes: input.setupMinutes,
        minutes_per_unit: input.minutesPerUnit,
        note: blankToNull(input.note),
        assembled: input.assembled,
      })
      .eq('id', id)
      .select('id');
    if (error) fail(error, 'No pudimos guardar la receta.');
    changed(data);
  }

  /**
   * Las piezas que el taller sabe producir, para decir qué sale de una placa.
   * Son artículos de inventario como cualquier otro: lo único que las
   * distingue es que no se compran, se imprimen.
   */
  async parts(): Promise<{ id: string; name: string; unit: string; imagePath: string | null }[]> {
    const { data, error } = await this.supabase
      .from('inventory_items')
      .select('id, name, unit, image_path')
      .eq('kind', 'part')
      .eq('active', true)
      .order('name');
    if (error) fail(error, 'No pudimos cargar las piezas.');
    return (data ?? []).map((part) => ({ id: part.id, name: part.name, unit: part.unit, imagePath: part.image_path }));
  }

  async addPlate(recipeId: string, plateIndex: number, input: RecipePlateInput): Promise<void> {
    const { error } = await this.supabase.from('recipe_plates').insert({
      workspace_id: await this.workspaceId(),
      recipe_id: recipeId,
      plate_index: plateIndex,
      label: blankToNull(input.label),
      units_per_run: input.unitsPerRun,
      print_time_s: input.printTimeS,
    });
    if (error) fail(error, 'No pudimos agregar la placa.', 'Ya existe una placa con ese número.');
  }

  /** One part that comes out of a plate. Saved one by one, like its filaments. */
  async addPlateOutput(plateId: string, position: number, input: PlateOutputInput): Promise<void> {
    const { error } = await this.supabase.from('recipe_plate_outputs').insert({
      workspace_id: await this.workspaceId(),
      recipe_plate_id: plateId,
      inventory_item_id: input.inventoryItemId,
      units_per_run: input.unitsPerRun,
      position,
    });
    if (error) fail(error, 'No pudimos agregar la pieza a la placa.', 'Esa pieza ya sale de esta placa.');
  }

  async updatePlateOutput(id: string, input: PlateOutputInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('recipe_plate_outputs')
      .update({ inventory_item_id: input.inventoryItemId, units_per_run: input.unitsPerRun })
      .eq('id', id)
      .select('id');
    if (error) fail(error, 'No pudimos guardar la pieza de la placa.', 'Esa pieza ya sale de esta placa.');
    changed(data);
  }

  async deletePlateOutput(id: string): Promise<void> {
    const { data, error } = await this.supabase.from('recipe_plate_outputs').delete().eq('id', id).select('id');
    if (error) fail(error, 'No pudimos quitar la pieza de la placa.');
    await this.removed(data, OWNER_ONLY.recipeRows);
  }

  /**
   * Qué pieza dijo la persona que era cada objeto de un archivo laminado, en
   * todo lo importado antes, para proponerla de nuevo. Basta con lo reciente:
   * un taller usa pocos nombres de objeto y los repite.
   */
  async learnedObjectParts(): Promise<Map<string, string>> {
    const { data, error } = await this.supabase
      .from('recipe_plates')
      .select('slicer_metadata')
      .not('source_file_name', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(LEARNED_PLATES_LIMIT);
    if (error) fail(error, 'No pudimos leer las importaciones anteriores.');
    return learnedParts(data.map((row) => recordFromJson(row.slicer_metadata)));
  }

  /**
   * Carga placas enteras desde un archivo ya laminado y revisado por la
   * persona: los minutos y los gramos, la miniatura, lo que dijo el archivo,
   * las piezas que confirmó y las nuevas que nombró.
   *
   * Es el mismo lector que usa el cotizador, sobre el mismo archivo. Que la
   * receta —que es donde ese dato vive para siempre— lo pidiera escrito a mano
   * era pedirle a una persona que copiara números de una pantalla a otra.
   *
   * Todo se guarda en una sola llamada (`import_plates`): si algo falla no
   * queda ninguna placa ni ninguna pieza, para el dueño ni para el operador
   * (E2-03). Las miniaturas se suben antes, porque la base no puede subirlas,
   * y se borran si la llamada falla. Una que no sube no detiene nada: la
   * placa sirve igual, y se cuenta para avisarlo.
   */
  async importPlates(
    recipeId: string,
    firstIndex: number,
    plates: ImportedPlate[],
    newParts: { key: string; name: string }[],
  ): Promise<ImportResult> {
    const thumbnails: (string | null)[] = [];
    for (const [offset, plate] of plates.entries()) {
      thumbnails.push(await this.uploadThumbnail(plate.thumbnail, firstIndex + offset));
    }
    const withoutThumbnail = plates.filter((plate, index) => plate.thumbnail && !thumbnails[index]).length;

    const { data, error } = await this.supabase.rpc('import_plates', {
      p_recipe_id: recipeId,
      p_first_index: firstIndex,
      p_new_parts: newParts,
      p_plates: plates.map((plate, index) => ({
        label: blankToNull(plate.label),
        units_per_run: plate.unitsPerRun,
        print_time_s: plate.printTimeS,
        source_file_name: plate.sourceFileName,
        thumbnail_path: thumbnails[index] ?? null,
        slicer_metadata: recordToJson(plate.record),
        filaments: plate.filaments.map((filament) => ({
          slot: filament.slot,
          material_id: filament.materialId,
          color_hex: filament.colorHex,
          filament_sku_id: filament.skuId,
          grams: filament.grams,
        })),
        outputs: plate.outputs.map((output) => ({
          inventory_item_id: output.inventoryItemId,
          units_per_run: output.unitsPerRun,
        })),
      })),
    });
    if (error) {
      await Promise.all(thumbnails.map((path) => this.media.remove(path).catch(() => undefined)));
      fail(error, 'No pudimos guardar las placas.', 'Ya existe una placa con ese número. Recarga la página.');
    }

    const result = (data ?? {}) as Record<string, unknown>;
    return {
      created: Number(result['created'] ?? plates.length),
      partsCreated: Number(result['parts_created'] ?? 0),
      withoutThumbnail,
    };
  }

  /** The picture is a convenience: if it does not upload, the plate is saved without it. */
  private async uploadThumbnail(thumbnail: Blob | null, plateIndex: number): Promise<string | null> {
    if (!thumbnail) return null;
    try {
      const file = new File([thumbnail], `placa-${plateIndex}.png`, { type: thumbnail.type || 'image/png' });
      return await this.media.upload(file, 'impresiones');
    } catch {
      return null;
    }
  }

  async updatePlate(id: string, input: RecipePlateInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('recipe_plates')
      .update({
        label: blankToNull(input.label),
        units_per_run: input.unitsPerRun,
        print_time_s: input.printTimeS,
      })
      .eq('id', id)
      .select('id');
    if (error) fail(error, 'No pudimos guardar la placa.');
    changed(data);
  }

  /** The database refuses a plate whose print is still in the queue, and says so. */
  async deletePlate(id: string): Promise<void> {
    const { data, error } = await this.supabase.from('recipe_plates').delete().eq('id', id).select('id');
    if (error) fail(error, 'No pudimos quitar la placa.');
    await this.removed(data, OWNER_ONLY.recipeRows);
  }

  async addFilament(plateId: string, input: RecipeFilamentInput): Promise<void> {
    const { error } = await this.supabase.from('recipe_plate_filaments').insert({
      workspace_id: await this.workspaceId(),
      recipe_plate_id: plateId,
      ...this.filamentRow(input),
    });
    if (error) fail(error, 'No pudimos agregar el filamento.', 'Esa ranura ya está usada en esta placa.');
  }

  async updateFilament(id: string, input: RecipeFilamentInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('recipe_plate_filaments')
      .update(this.filamentRow(input))
      .eq('id', id)
      .select('id');
    if (error) fail(error, 'No pudimos guardar el filamento.', 'Esa ranura ya está usada en esta placa.');
    changed(data);
  }

  async deleteFilament(id: string): Promise<void> {
    const { data, error } = await this.supabase.from('recipe_plate_filaments').delete().eq('id', id).select('id');
    if (error) fail(error, 'No pudimos quitar el filamento.');
    await this.removed(data, OWNER_ONLY.recipeRows);
  }

  private filamentRow(input: RecipeFilamentInput) {
    return {
      slot: input.slot,
      material_id: input.materialId,
      color_hex: input.colorHex,
      filament_sku_id: input.skuId,
      grams: input.grams,
    };
  }

  async addSupply(recipeId: string, inventoryItemId: string, quantityPerUnit: number): Promise<void> {
    const { error } = await this.supabase.from('recipe_items').insert({
      workspace_id: await this.workspaceId(),
      recipe_id: recipeId,
      inventory_item_id: inventoryItemId,
      quantity_per_unit: quantityPerUnit,
    });
    if (error) fail(error, 'No pudimos agregar el insumo.', 'Ese insumo ya está en la receta.');
  }

  async updateSupply(id: string, quantityPerUnit: number): Promise<void> {
    const { data, error } = await this.supabase
      .from('recipe_items')
      .update({ quantity_per_unit: quantityPerUnit })
      .eq('id', id)
      .select('id');
    if (error) fail(error, 'No pudimos guardar el insumo.');
    changed(data);
  }

  async deleteSupply(id: string): Promise<void> {
    const { data, error } = await this.supabase.from('recipe_items').delete().eq('id', id).select('id');
    if (error) fail(error, 'No pudimos quitar el insumo.');
    await this.removed(data, OWNER_ONLY.recipeRows);
  }

  // ------------------------------------------------------------- price tiers

  async listTiers(variantId: string): Promise<PriceTierRow[]> {
    const { data, error } = await this.supabase
      .from('price_tiers')
      .select('id, min_quantity, unit_price, valid_from, note')
      .eq('variant_id', variantId)
      .lte('valid_from', todayLocal())
      .order('min_quantity');
    if (error) fail(error, 'No pudimos cargar la escalera de precios.');

    return data.map((row) => ({
      id: row.id,
      minQuantity: row.min_quantity,
      unitPrice: Number(row.unit_price),
      validFrom: row.valid_from,
      note: row.note,
    }));
  }

  /**
   * A tier starts today in Lima. Left to the database's own date, one added
   * after 19:00 started tomorrow and vanished from the list until midnight
   * (T1-15).
   */
  async addTier(variantId: string, minQuantity: number, unitPrice: number): Promise<void> {
    const { error } = await this.supabase.from('price_tiers').insert({
      workspace_id: await this.workspaceId(),
      variant_id: variantId,
      min_quantity: minQuantity,
      unit_price: unitPrice,
      valid_from: todayLocal(),
    });
    if (error) {
      fail(error, 'No pudimos agregar el escalón.', 'Ya hay un escalón desde esa cantidad.');
    }
  }

  async deleteTier(id: string): Promise<void> {
    const { data, error } = await this.supabase.from('price_tiers').delete().eq('id', id).select('id');
    if (error) fail(error, 'No pudimos quitar el escalón.');
    await this.removed(data, OWNER_ONLY.tiers);
  }

  /**
   * A delete that took nothing. For anyone but the owner that is the policy
   * saying no; for the owner, the row was already gone. The role is read
   * again, not taken from this tab: it may have changed in another one, and
   * the screen stops offering what was refused.
   */
  private async removed(rows: unknown[] | null, ownerOnly: string): Promise<void> {
    if (rows && rows.length > 0) return;
    const { role } = await this.workspace.refresh();
    throw new CatalogoError(isOwnerRole(role) ? GONE : ownerOnly);
  }

  // -------------------------------------------------------- costing sources

  /** Materials, spool products and supplies, each with the cost the stock says. */
  async lookups(): Promise<Lookups> {
    const [materials, skus, stock, items, costs, partCosts, printed] = await Promise.all([
      this.supabase.from('materials').select('id, code').order('code'),
      this.supabase
        .from('filament_skus')
        .select('id, material_id, color_name, color_hex, tray_info_idx, active, replacement_cost_per_kg, brands(name), filament_finishes(name)')
        .order('color_name'),
      this.supabase.from('filament_sku_stock').select('filament_sku_id, weighted_cost_per_gram'),
      this.supabase
        .from('inventory_items')
        .select('id, name, unit, kind, image_path')
        .eq('active', true)
        .order('name'),
      // The view owns what a supply costs. This used to be rebuilt here from
      // purchase rows as a weighted average, which was a third answer to the
      // same question and ignored the standard cost altogether. The view takes
      // the LAST purchase, not an average, on purpose: the quoting screen and
      // order estimates read the same view, so all three now agree.
      this.supabase.from('inventory_item_costs').select('inventory_item_id, cost_per_unit'),
      // A printed part is never bought: what it costs is what printing it cost.
      this.supabase.from('part_stock').select('inventory_item_id, cost_per_unit'),
      // Which active recipes print each part, to never say «la imprime otra
      // receta» of one that nothing else prints (T2-07).
      fetchAll((from, to) =>
        this.supabase
          .from('recipe_plate_outputs')
          .select('inventory_item_id, recipe_plates(recipe_id, recipes(active))')
          .order('id')
          .range(from, to),
      ).catch((error: PostgrestError) => fail(error, 'No pudimos ver qué piezas imprime cada receta.')),
    ]);
    if (materials.error) fail(materials.error, 'No pudimos cargar los materiales.');
    if (skus.error) fail(skus.error, 'No pudimos cargar los filamentos.');
    if (stock.error) fail(stock.error, 'No pudimos cargar el costo del stock.');
    if (items.error) fail(items.error, 'No pudimos cargar los insumos.');
    if (costs.error) fail(costs.error, 'No pudimos cargar el costo de los insumos.');
    if (partCosts.error) fail(partCosts.error, 'No pudimos cargar el costo de las piezas.');

    const stockCost = new Map(stock.data.map((row) => [row.filament_sku_id, numberOrNull(row.weighted_cost_per_gram)]));
    const printedBy = new Map<string, Set<string>>();
    for (const row of printed) {
      const plate = row.recipe_plates;
      if (!plate?.recipes?.active) continue;
      const recipes = printedBy.get(row.inventory_item_id) ?? new Set<string>();
      recipes.add(plate.recipe_id);
      printedBy.set(row.inventory_item_id, recipes);
    }
    const materialCode = new Map(materials.data.map((row) => [row.id, row.code]));

    return {
      materials: materials.data,
      skus: skus.data.map(
        (sku): SkuOption => ({
          id: sku.id,
          materialId: sku.material_id,
          label: [sku.brands?.name, materialCode.get(sku.material_id), sku.filament_finishes?.name, sku.color_name]
            .filter(Boolean)
            .join(' · '),
          colorHex: sku.color_hex,
          trayInfoIdx: sku.tray_info_idx,
          active: sku.active,
          stockCostPerGram: stockCost.get(sku.id) ?? null,
          replacementCostPerGram:
            sku.replacement_cost_per_kg === null
              ? null
              : Number(sku.replacement_cost_per_kg) / GRAMS_PER_KG,
        }),
      ),
      supplies: supplyOptions(items.data, costs.data, partCosts.data),
      printedBy,
    };
  }

  /** The cost profile in force today and the active printers with their machine rates. */
  async costContext(): Promise<CostContext> {
    const [profiles, printers, rates, workspace] = await Promise.all([
      this.supabase
        .from('cost_profiles')
        .select('*')
        .lte('valid_from', todayLocal())
        .order('valid_from', { ascending: false })
        .limit(1),
      this.supabase
        .from('printers')
        .select(
          'id, name, avg_power_w, maintenance_budget_per_year, expected_hours_per_year, assets(cost, useful_life_hours)',
        )
        .eq('status', 'active')
        .order('name'),
      this.supabase.from('printer_machine_rates').select('printer_id, machine_rate_per_hour'),
      this.workspace.info(),
    ]);
    if (profiles.error) fail(profiles.error, 'No pudimos leer los parámetros de costo.');
    if (printers.error) fail(printers.error, 'No pudimos leer las impresoras.');
    if (rates.error) fail(rates.error, 'No pudimos leer las horas de máquina.');

    const row = profiles.data[0];
    const profile: CostProfile | null = row
      ? {
          materialWasteRate: Number(row.material_waste_rate),
          failureRate: Number(row.failure_rate),
          laborRatePerHour: Number(row.labor_rate_per_hour),
          energyRatePerKwh: Number(row.energy_rate_per_kwh),
          targetMargin: Number(row.target_margin),
          minOrderPrice: Number(row.min_order_price),
          roundingStep: Number(row.rounding_step),
          igvRate: Number(row.igv_rate),
          taxRegime: workspace.taxRegime,
        }
      : null;

    const rateById = new Map(rates.data.map((rate) => [rate.printer_id, Number(rate.machine_rate_per_hour)]));

    return {
      profile,
      printers: printers.data.map(
        (printer): PrinterOption => ({
          id: printer.id,
          name: printer.name,
          machineRatePerHour: rateById.get(printer.id) ?? 0,
          profile: {
            name: printer.name,
            avgPowerWatts: Number(printer.avg_power_w),
            assetCost: Number(printer.assets?.cost ?? 0),
            usefulLifeHours: Number(printer.assets?.useful_life_hours ?? 0),
            maintenanceCostPerYear: Number(printer.maintenance_budget_per_year),
            printHoursPerYear: Number(printer.expected_hours_per_year),
          } satisfies PrinterProfile,
        }),
      ),
    };
  }
}
