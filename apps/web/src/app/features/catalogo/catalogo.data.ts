import { inject, Injectable } from '@angular/core';
import type { PostgrestError } from '@supabase/supabase-js';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import type { CostProfile, PrinterProfile } from '../../core/pricing';
import type { Json } from '../../core/database.types';
import type {
  CostContext,
  Lookups,
  Pair,
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
} from './catalogo.models';
import { supplyOptions } from './costing';
import { blankToNull, CatalogoError, todayIso } from './catalogo.util';

const GRAMS_PER_KG = 1000;

const PG_UNIQUE = '23505';
const PG_FOREIGN_KEY = '23503';
const PG_CHECK = '23514';
const PG_NOT_ALLOWED = '42501';

/** Turns a database error into a message a person can act on. */
function fail(error: PostgrestError, fallback: string, duplicate?: string): never {
  if (error.code === PG_UNIQUE && duplicate) throw new CatalogoError(duplicate);
  if (error.code === PG_FOREIGN_KEY) {
    throw new CatalogoError('No se puede hacer porque otra parte del sistema depende de esto.');
  }
  if (error.code === PG_CHECK) throw new CatalogoError('Alguno de los valores no es válido.');
  if (error.code === PG_NOT_ALLOWED) {
    throw new CatalogoError('No tienes permiso para hacer esto.');
  }
  if (/fetch|network/i.test(error.message)) {
    throw new CatalogoError('No hay conexión con el servidor. Revisa tu internet.');
  }
  throw new CatalogoError(fallback);
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

/** Everything the catalogue screens read and write. Pages never touch Supabase. */
@Injectable({ providedIn: 'root' })
export class CatalogoData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  /** Rows are created inside the person's workshop; RLS keeps it that way. */
  private workspaceId(): Promise<string> {
    return this.workspace.requireId();
  }

  // ---------------------------------------------------------------- products

  async listProducts(): Promise<ProductSummary[]> {
    const { data, error } = await this.supabase
      .from('catalog_products')
      .select(
        'id, name, slug, status, bot_visible, lead_time_days, category, product_variants(id, name, list_price, active)',
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
      variants: row.product_variants
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          listPrice: numberOrNull(variant.list_price),
          active: variant.active,
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
    const { error } = await this.supabase
      .from('catalog_products')
      .update({
        name: input.name.trim(),
        slug: input.slug,
        description: blankToNull(input.description),
        category: blankToNull(input.category),
        tags: input.tags,
        lead_time_days: input.leadTimeDays,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.botVisible === undefined ? {} : { bot_visible: input.botVisible }),
        specs: fromPairs(input.specs),
      })
      .eq('id', id);
    if (error) {
      fail(error, 'No pudimos guardar el producto.', 'Ya hay un producto con ese identificador (slug).');
    }
  }

  async setProductStatus(id: string, status: ProductStatus): Promise<void> {
    const { error } = await this.supabase.from('catalog_products').update({ status }).eq('id', id);
    if (error) fail(error, 'No pudimos cambiar el estado del producto.');
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
    const { error } = await this.supabase
      .from('product_variants')
      .update(this.variantRow(input))
      .eq('id', id);
    if (error) {
      fail(error, 'No pudimos guardar la variante.', 'Ya hay una variante con ese nombre en este producto.');
    }
  }

  /** Deleting a variant also deletes its recipe and its price tiers. */
  async deleteVariant(id: string): Promise<void> {
    const { error } = await this.supabase.from('product_variants').delete().eq('id', id);
    if (error) fail(error, 'No pudimos eliminar la variante.');
  }

  private variantRow(input: VariantInput) {
    return {
      name: input.name.trim(),
      options: fromPairs(input.options),
      sku_code: blankToNull(input.skuCode),
      list_price: input.listPrice,
      min_order_units: input.minOrderUnits,
      active: input.active,
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
        .select('*, recipe_plate_filaments(*)')
        .eq('recipe_id', recipe.id)
        .order('plate_index'),
      this.supabase.from('recipe_items').select('*').eq('recipe_id', recipe.id).order('created_at'),
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
      plates: plates.data.map((plate) => ({
        id: plate.id,
        label: plate.label,
        plateIndex: plate.plate_index,
        unitsPerRun: Number(plate.units_per_run),
        printTimeS: plate.print_time_s,
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
      })),
    };
  }

  async createRecipe(variantId: string): Promise<void> {
    const { error } = await this.supabase
      .from('recipes')
      .insert({ workspace_id: await this.workspaceId(), variant_id: variantId, version: await this.nextRecipeVersion(variantId) });
    if (error) fail(error, 'No pudimos crear la receta.');
  }

  private async nextRecipeVersion(variantId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('recipes')
      .select('version')
      .eq('variant_id', variantId)
      .order('version', { ascending: false })
      .limit(1);
    if (error) fail(error, 'No pudimos crear la receta.');
    return (data[0]?.version ?? 0) + 1;
  }

  async updateRecipe(id: string, input: RecipeHeaderInput): Promise<void> {
    const { error } = await this.supabase
      .from('recipes')
      .update({
        setup_minutes: input.setupMinutes,
        minutes_per_unit: input.minutesPerUnit,
        note: blankToNull(input.note),
      })
      .eq('id', id);
    if (error) fail(error, 'No pudimos guardar la receta.');
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

  async updatePlate(id: string, input: RecipePlateInput): Promise<void> {
    const { error } = await this.supabase
      .from('recipe_plates')
      .update({
        label: blankToNull(input.label),
        units_per_run: input.unitsPerRun,
        print_time_s: input.printTimeS,
      })
      .eq('id', id);
    if (error) fail(error, 'No pudimos guardar la placa.');
  }

  async deletePlate(id: string): Promise<void> {
    const { error } = await this.supabase.from('recipe_plates').delete().eq('id', id);
    if (error) fail(error, 'No pudimos quitar la placa.');
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
    const { error } = await this.supabase
      .from('recipe_plate_filaments')
      .update(this.filamentRow(input))
      .eq('id', id);
    if (error) fail(error, 'No pudimos guardar el filamento.', 'Esa ranura ya está usada en esta placa.');
  }

  async deleteFilament(id: string): Promise<void> {
    const { error } = await this.supabase.from('recipe_plate_filaments').delete().eq('id', id);
    if (error) fail(error, 'No pudimos quitar el filamento.');
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
    const { error } = await this.supabase
      .from('recipe_items')
      .update({ quantity_per_unit: quantityPerUnit })
      .eq('id', id);
    if (error) fail(error, 'No pudimos guardar el insumo.');
  }

  async deleteSupply(id: string): Promise<void> {
    const { error } = await this.supabase.from('recipe_items').delete().eq('id', id);
    if (error) fail(error, 'No pudimos quitar el insumo.');
  }

  // ------------------------------------------------------------- price tiers

  async listTiers(variantId: string): Promise<PriceTierRow[]> {
    const { data, error } = await this.supabase
      .from('price_tiers')
      .select('id, min_quantity, unit_price, valid_from, note')
      .eq('variant_id', variantId)
      .lte('valid_from', todayIso())
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

  async addTier(variantId: string, minQuantity: number, unitPrice: number): Promise<void> {
    const { error } = await this.supabase.from('price_tiers').insert({
      workspace_id: await this.workspaceId(),
      variant_id: variantId,
      min_quantity: minQuantity,
      unit_price: unitPrice,
    });
    if (error) {
      fail(error, 'No pudimos agregar el escalón.', 'Ya hay un escalón desde esa cantidad.');
    }
  }

  async deleteTier(id: string): Promise<void> {
    const { error } = await this.supabase.from('price_tiers').delete().eq('id', id);
    if (error) fail(error, 'No pudimos quitar el escalón.');
  }

  // -------------------------------------------------------- costing sources

  /** Materials, spool products and supplies, each with the cost the stock says. */
  async lookups(): Promise<Lookups> {
    const [materials, skus, stock, items, costs] = await Promise.all([
      this.supabase.from('materials').select('id, code').order('code'),
      this.supabase
        .from('filament_skus')
        .select('id, material_id, color_name, color_hex, active, replacement_cost_per_kg, brands(name), filament_finishes(name)')
        .order('color_name'),
      this.supabase.from('filament_sku_stock').select('filament_sku_id, weighted_cost_per_gram'),
      this.supabase
        .from('inventory_items')
        .select('id, name, unit')
        .eq('active', true)
        .order('name'),
      // The view owns what a supply costs. This used to be rebuilt here from
      // purchase rows as a weighted average, which was a third answer to the
      // same question and ignored the standard cost altogether. The view takes
      // the LAST purchase, not an average, on purpose: the quoting screen and
      // order estimates read the same view, so all three now agree.
      this.supabase.from('inventory_item_costs').select('inventory_item_id, cost_per_unit'),
    ]);
    if (materials.error) fail(materials.error, 'No pudimos cargar los materiales.');
    if (skus.error) fail(skus.error, 'No pudimos cargar los filamentos.');
    if (stock.error) fail(stock.error, 'No pudimos cargar el costo del stock.');
    if (items.error) fail(items.error, 'No pudimos cargar los insumos.');
    if (costs.error) fail(costs.error, 'No pudimos cargar el costo de los insumos.');

    const stockCost = new Map(stock.data.map((row) => [row.filament_sku_id, numberOrNull(row.weighted_cost_per_gram)]));
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
          active: sku.active,
          stockCostPerGram: stockCost.get(sku.id) ?? null,
          replacementCostPerGram:
            sku.replacement_cost_per_kg === null
              ? null
              : Number(sku.replacement_cost_per_kg) / GRAMS_PER_KG,
        }),
      ),
      supplies: supplyOptions(items.data, costs.data),
    };
  }

  /** The cost profile in force today and the active printers with their machine rates. */
  async costContext(): Promise<CostContext> {
    const [profiles, printers, rates, workspace] = await Promise.all([
      this.supabase
        .from('cost_profiles')
        .select('*')
        .lte('valid_from', todayIso())
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
