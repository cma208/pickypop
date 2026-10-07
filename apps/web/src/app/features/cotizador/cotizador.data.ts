import { inject, Injectable } from '@angular/core';
import type { PostgrestError } from '@supabase/supabase-js';
import { todayLocal } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace, type WorkspaceInfo } from '../../core/workspace';
import type { Database } from '../../core/database.types';
import type { CostProfile, PriceTier, PrinterProfile } from '../../core/pricing';
import {
  type FilamentOption,
  type LineDraft,
  type MaterialValuation,
  type PlateDraft,
  type PriceSettings,
  type PrinterOption,
  type SupplyDraft,
} from './quote-model';
import { toCostSource, type SupplyCostSource } from './supply-costs';

/**
 * Everything the calculator and the quote screens read and write.
 *
 * No query filters by workshop: row level security already does, and doing it
 * twice only hides mistakes. See docs/06-frontend.md section 6.3.
 */

export type QuoteStatus = Database['public']['Enums']['quote_status'];

const GRAMS_PER_KG = 1000;
const LONG_AGO = new Date(0).toISOString();

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
};

// ------------------------------------------------------------------ types

export interface SupplyOption {
  id: string;
  name: string;
  unit: string;
  available: number;
  /**
   * Cost per unit: the last purchase (shipping included) when there is one,
   * the standard cost otherwise. Null only when `costSource` is 'unknown'.
   */
  unitCost: number | null;
  costSource: SupplyCostSource;
}

export interface VariantOption {
  id: string;
  label: string;
  listPrice: number | null;
  tiers: PriceTier[];
}

export interface CustomerOption {
  id: string;
  name: string;
}

export interface ChannelOption {
  id: string;
  name: string;
  commissionRate: number;
}

export interface RequestOption {
  id: string;
  description: string;
  contact: string | null;
  customerId: string | null;
  channelId: string | null;
  createdAt: string;
}

/** Everything the calculator needs loaded before it can quote anything. */
export interface QuotingContext {
  workspaceId: string;
  workspaceName: string;
  profile: CostProfile;
  profileId: string;
  profileValidFrom: string;
  valuation: MaterialValuation;
  printers: PrinterOption[];
  filaments: FilamentOption[];
  supplies: SupplyOption[];
  variants: VariantOption[];
  customers: CustomerOption[];
  channels: ChannelOption[];
  requests: RequestOption[];
}

/** The frozen parameters a quote keeps, so it never changes afterwards. */
export interface QuoteSnapshot {
  profile: CostProfile;
  profileId: string | null;
  profileValidFrom: string | null;
  printer: PrinterProfile;
  printerId: string | null;
  valuation: MaterialValuation;
  priceSettings: PriceSettings;
  calculatedAt: string;
}

/** A quote line as it was stored: the inputs, with the costs of the day. */
export interface StoredLine {
  id: string;
  position: number;
  kind: Database['public']['Enums']['quote_line_kind'];
  variantId: string | null;
  description: string;
  quantity: number;
  setupMinutes: number;
  minutesPerUnit: number;
  unitCost: number;
  unitPrice: number;
  lineTotal: number;
  plates: PlateDraft[];
  supplies: SupplyDraft[];
  /** Frozen names and prices, so the detail reads even if a SKU was renamed. */
  filamentLabels: Record<string, string>;
  filamentCostPerKg: Record<string, number>;
}

export interface QuoteSummary {
  id: string;
  number: string;
  version: number;
  status: QuoteStatus;
  customerName: string | null;
  issuedOn: string;
  validUntil: string | null;
  total: number;
  lines: number;
  hasNewerVersion: boolean;
}

export interface QuoteDetail extends QuoteSummary {
  parentQuoteId: string | null;
  customerId: string | null;
  channelId: string | null;
  channelName: string | null;
  requestId: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  igv: number;
  snapshot: QuoteSnapshot | null;
  storedLines: StoredLine[];
  /** When it started holding what it asks for: its place in the line. */
  heldAt: string | null;
  /** Until when the hold lasts. Past, it holds nothing; null, it never held. */
  holdUntil: string | null;
  /** The order it became, once the customer accepted. A cancelled one does not count. */
  order: { id: string; number: string } | null;
}

/** What the person fills in when the customer says yes. */
export interface QuoteAcceptance {
  quoteId: string;
  /** "YYYY-MM-DD", or null when there is no promised date yet. */
  dueDate: string | null;
  note: string | null;
  /** Only for a quote that was made without a customer. */
  customerId: string | null;
}

export interface NewQuoteLine {
  description: string;
  variantId: string | null;
  quantity: number;
  setupMinutes: number;
  minutesPerUnit: number;
  unitCost: number;
  unitPrice: number;
  plates: PlateDraft[];
  supplies: SupplyDraft[];
  filamentLabels: Record<string, string>;
  filamentCostPerKg: Record<string, number>;
}

export interface NewQuote {
  workspaceId: string;
  customerId: string | null;
  channelId: string | null;
  requestId: string | null;
  validUntil: string | null;
  note: string | null;
  snapshot: QuoteSnapshot;
  subtotal: number;
  discount: number;
  igv: number;
  total: number;
  lines: NewQuoteLine[];
  /** Set to quote a new version of an existing document instead of a new one. */
  previousVersionOf: { quoteId: string; number: string; version: number } | null;
}

/**
 * Rebuilds the filament list a stored line was costed with, from the names and
 * prices frozen into it. Feeding this back into the shared formulas is what
 * makes a saved quote show the very numbers it was sold at, even after the
 * stock, the prices or the SKU names have moved on.
 */
export function frozenFilaments(line: StoredLine): FilamentOption[] {
  return Object.keys({ ...line.filamentLabels, ...line.filamentCostPerKg }).map((id) => ({
    id,
    label: line.filamentLabels[id] ?? 'Filamento',
    colorHex: null,
    trayInfoIdx: null,
    availableG: Number.POSITIVE_INFINITY,
    costPerKg: line.filamentCostPerKg[id] ?? 0,
    valuationUsed: null,
  }));
}

// --------------------------------------------------------------- helpers

/** Postgres numerics arrive as strings often enough to be worth guarding. */
function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Turns a Postgrest failure into something a person can act on. */
export function explain(error: unknown, fallback: string): string {
  const postgrest = error as Partial<PostgrestError> | null;
  const code = postgrest?.code ?? '';

  if (code === 'PGRST301' || code === '42501') {
    return 'No tienes permiso para hacer esto en este taller.';
  }
  if (code === '23505') return 'Ese documento ya existe. Vuelve a intentarlo.';
  if (code === '23503') return 'Falta un dato relacionado: revisa el cliente o la variante.';

  return fallback;
}

export class DataError extends Error {}

function fail(error: PostgrestError | null, fallback: string): void {
  if (error !== null) throw new DataError(explain(error, fallback));
}

function parseFilaments(raw: unknown): PlateDraft['filaments'] {
  return list(raw).map((item, index) => {
    const row = record(item);
    return {
      slot: num(row['slot'], index + 1),
      grams: num(row['grams']),
      colorHex: text(row['colorHex']),
      type: text(row['type']),
      trayInfoIdx: text(row['trayInfoIdx']),
      filamentSkuId: text(row['filamentSkuId']),
    };
  });
}

function parsePlates(raw: unknown): PlateDraft[] {
  return list(raw).map((item, index) => {
    const row = record(item);
    const source = text(row['source']);

    return {
      label: text(row['label']) ?? `Placa ${index + 1}`,
      printTimeSeconds: num(row['printTimeSeconds']),
      unitsPerRun: num(row['unitsPerRun'], 1),
      source: source === 'file' || source === 'recipe' ? source : 'manual',
      sourceFileName: text(row['sourceFileName']),
      filaments: parseFilaments(row['filaments']),
    };
  });
}

function parseSupplies(raw: unknown): SupplyDraft[] {
  return list(raw).map((item) => {
    const row = record(item);
    return {
      label: text(row['label']) ?? 'Insumo',
      inventoryItemId: text(row['inventoryItemId']),
      scope: row['scope'] === 'batch' ? 'batch' : 'unit',
      quantity: num(row['quantity'], 1),
      unitCost: num(row['unitCost']),
    };
  });
}

function parseStringMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record(raw))) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function parseNumberMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(record(raw))) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

function parseSnapshot(raw: unknown): QuoteSnapshot | null {
  const row = record(raw);
  const profile = record(row['profile']);
  const printer = record(row['printer']);
  if (Object.keys(profile).length === 0) return null;

  const valuation = text(row['valuation']);
  const settings = record(row['priceSettings']);
  const regime = text(profile['taxRegime']);

  return {
    profile: {
      materialWasteRate: num(profile['materialWasteRate']),
      failureRate: num(profile['failureRate']),
      laborRatePerHour: num(profile['laborRatePerHour']),
      energyRatePerKwh: num(profile['energyRatePerKwh']),
      targetMargin: num(profile['targetMargin']),
      minOrderPrice: num(profile['minOrderPrice']),
      roundingStep: num(profile['roundingStep']),
      igvRate: num(profile['igvRate']),
      taxRegime:
        regime === 'nrus' || regime === 'rer' || regime === 'rmt' || regime === 'general'
          ? regime
          : 'none',
    },
    profileId: text(row['profileId']),
    profileValidFrom: text(row['profileValidFrom']),
    printer: {
      name: text(printer['name']) ?? 'Impresora',
      avgPowerWatts: num(printer['avgPowerWatts']),
      assetCost: num(printer['assetCost']),
      usefulLifeHours: num(printer['usefulLifeHours']),
      maintenanceCostPerYear: num(printer['maintenanceCostPerYear']),
      printHoursPerYear: num(printer['printHoursPerYear']),
    },
    printerId: text(row['printerId']),
    valuation:
      valuation === 'last_cost' || valuation === 'replacement' ? valuation : 'weighted_avg',
    priceSettings: {
      volumeDiscountRate: num(settings['volumeDiscountRate']),
      urgencySurchargeRate: num(settings['urgencySurchargeRate']),
      channelCommissionRate: num(settings['channelCommissionRate']),
    },
    calculatedAt: text(row['calculatedAt']) ?? '',
  };
}

// ------------------------------------------------------------------ data

@Injectable({ providedIn: 'root' })
export class CotizadorData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  /** Loads the parameters, stock prices and lists the calculator works from. */
  async context(): Promise<QuotingContext> {
    const parameters = await this.parameters();

    const [printers, filaments, supplies, variants, customers, channels, requests] =
      await Promise.all([
        this.printers(),
        this.filaments(parameters.valuation),
        this.supplies(),
        this.variants(),
        this.customers(),
        this.channels(),
        this.pendingRequests(),
      ]);

    return { ...parameters, printers, filaments, supplies, variants, customers, channels, requests };
  }

  /** The rate sheet in force today, plus the workshop it belongs to. */
  private async parameters(): Promise<
    Pick<
      QuotingContext,
      'workspaceId' | 'workspaceName' | 'profile' | 'profileId' | 'profileValidFrom' | 'valuation'
    >
  > {
    let workspace: WorkspaceInfo;
    try {
      workspace = await this.workspace.info();
    } catch {
      throw new DataError('Tu usuario no pertenece a ningún taller.');
    }

    const [profiles] = await Promise.all([
      this.supabase
        .from('cost_profiles')
        .select('*')
        .lte('valid_from', todayLocal())
        .order('valid_from', { ascending: false })
        .limit(1),
    ]);

    fail(profiles.error, 'No pudimos leer los parámetros de costo.');

    const row = profiles.data?.[0];

    if (row === undefined) {
      throw new DataError(
        'Todavía no hay parámetros de costo vigentes. Créalos en Configuración antes de cotizar.',
      );
    }

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      profileId: row.id,
      profileValidFrom: row.valid_from,
      valuation: row.material_valuation,
      profile: {
        materialWasteRate: num(row.material_waste_rate),
        failureRate: num(row.failure_rate),
        laborRatePerHour: num(row.labor_rate_per_hour),
        energyRatePerKwh: num(row.energy_rate_per_kwh),
        targetMargin: num(row.target_margin),
        minOrderPrice: num(row.min_order_price),
        roundingStep: num(row.rounding_step),
        igvRate: num(row.igv_rate),
        // The regime belongs to the workshop, not to the rate sheet.
        taxRegime: workspace.taxRegime,
      },
    };
  }

  private async printers(): Promise<PrinterOption[]> {
    const { data, error } = await this.supabase
      .from('printers')
      .select(
        'id, name, avg_power_w, maintenance_budget_per_year, expected_hours_per_year, status, assets(cost, useful_life_hours)',
      )
      .neq('status', 'retired')
      .order('name');

    fail(error, 'No pudimos leer las impresoras.');

    return (data ?? []).map((row) => {
      const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;

      return {
        id: row.id,
        name: row.name,
        avgPowerWatts: num(row.avg_power_w),
        assetCost: num(asset?.cost),
        usefulLifeHours: num(asset?.useful_life_hours),
        maintenanceCostPerYear: num(row.maintenance_budget_per_year),
        printHoursPerYear: num(row.expected_hours_per_year),
      };
    });
  }

  /**
   * Prices every filament SKU under the valuation the profile asks for.
   * When the chosen method has nothing to say (a SKU with no stock, or no
   * replacement price), we fall back and report which method was used, rather
   * than quietly costing the material at zero.
   */
  private async filaments(valuation: MaterialValuation): Promise<FilamentOption[]> {
    const [skus, stock, spools] = await Promise.all([
      this.supabase
        .from('filament_skus')
        .select(
          'id, color_name, color_hex, tray_info_idx, replacement_cost_per_kg, active, brands(name), materials(code), filament_finishes(name)',
        )
        .eq('active', true),
      this.supabase
        .from('filament_sku_stock')
        .select('filament_sku_id, available_g, weighted_cost_per_gram'),
      this.supabase
        .from('spools')
        .select('filament_sku_id, cost_per_gram, created_at')
        .order('created_at', { ascending: false }),
    ]);

    fail(skus.error, 'No pudimos leer los filamentos.');
    fail(stock.error, 'No pudimos leer el stock de filamentos.');
    fail(spools.error, 'No pudimos leer los rollos.');

    const balances = new Map((stock.data ?? []).map((row) => [row.filament_sku_id, row]));

    const lastCost = new Map<string, number>();
    for (const spool of spools.data ?? []) {
      if (spool.filament_sku_id === null) continue;
      if (!lastCost.has(spool.filament_sku_id)) {
        lastCost.set(spool.filament_sku_id, num(spool.cost_per_gram) * GRAMS_PER_KG);
      }
    }

    return (skus.data ?? [])
      .map((sku) => {
        const balance = balances.get(sku.id);
        const brand = (Array.isArray(sku.brands) ? sku.brands[0] : sku.brands)?.name ?? '';
        const material = (Array.isArray(sku.materials) ? sku.materials[0] : sku.materials)?.code ?? '';

        const byMethod: Record<MaterialValuation, number | null> = {
          weighted_avg:
            balance?.weighted_cost_per_gram == null
              ? null
              : num(balance.weighted_cost_per_gram) * GRAMS_PER_KG,
          last_cost: lastCost.get(sku.id) ?? null,
          replacement:
            sku.replacement_cost_per_kg == null ? null : num(sku.replacement_cost_per_kg),
        };

        // Preferred method first, then whatever else can price the material.
        const order: MaterialValuation[] = [
          valuation,
          ...(['weighted_avg', 'last_cost', 'replacement'] as MaterialValuation[]).filter(
            (method) => method !== valuation,
          ),
        ];
        const used = order.find((method) => byMethod[method] !== null) ?? null;

        return {
          id: sku.id,
          label: [brand, material, sku.filament_finishes?.name, sku.color_name].filter(Boolean).join(' · '),
          colorHex: sku.color_hex,
          trayInfoIdx: sku.tray_info_idx,
          availableG: num(balance?.available_g),
          costPerKg: used === null ? null : byMethod[used],
          valuationUsed: used,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  /**
   * Supplies and packaging, priced by the `inventory_item_costs` view: the last
   * purchase when there is one, the standard cost until then. The view owns
   * that rule so the catalogue, orders and this screen cannot drift apart.
   */
  private async supplies(): Promise<SupplyOption[]> {
    const [items, balances, costs] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('id, name, unit, kind')
        .eq('active', true)
        .neq('kind', 'finished_good')
        .order('name'),
      this.supabase.from('inventory_balances').select('inventory_item_id, available'),
      this.supabase
        .from('inventory_item_costs')
        .select('inventory_item_id, cost_per_unit, cost_source'),
    ]);

    fail(items.error, 'No pudimos leer los insumos.');
    fail(balances.error, 'No pudimos leer el stock de insumos.');
    fail(costs.error, 'No pudimos leer los costos de los insumos.');

    const available = new Map((balances.data ?? []).map((row) => [row.inventory_item_id, row]));
    const priced = new Map((costs.data ?? []).map((row) => [row.inventory_item_id, row]));

    return (items.data ?? []).map((item) => {
      const cost = priced.get(item.id);
      const costSource = toCostSource(cost?.cost_source ?? null);

      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        available: num(available.get(item.id)?.available),
        // Null stays null: a missing price must not read as a free item.
        unitCost: costSource === 'unknown' || cost?.cost_per_unit == null ? null : num(cost.cost_per_unit),
        costSource,
      };
    });
  }

  private async variants(): Promise<VariantOption[]> {
    const [products, variants, tiers] = await Promise.all([
      this.supabase.from('catalog_products').select('id, name').neq('status', 'archived'),
      this.supabase
        .from('product_variants')
        .select('id, product_id, name, list_price')
        .eq('active', true),
      // Only the tiers already in force, latest first, so that among two tiers
      // with the same minimum the newer one wins: what `price_for_quantity` does.
      this.supabase
        .from('price_tiers')
        .select('variant_id, min_quantity, unit_price')
        .lte('valid_from', todayLocal())
        .order('valid_from', { ascending: false }),
    ]);

    fail(products.error, 'No pudimos leer el catálogo.');
    fail(variants.error, 'No pudimos leer las variantes.');
    fail(tiers.error, 'No pudimos leer la escalera de precios.');

    const productName = new Map((products.data ?? []).map((row) => [row.id, row.name]));

    return (variants.data ?? [])
      .filter((variant) => productName.has(variant.product_id))
      .map((variant) => ({
        id: variant.id,
        label: `${productName.get(variant.product_id) ?? ''} · ${variant.name}`,
        listPrice: variant.list_price == null ? null : num(variant.list_price),
        tiers: (tiers.data ?? [])
          .filter((tier) => tier.variant_id === variant.id)
          .map((tier) => ({ minQuantity: tier.min_quantity, unitPrice: num(tier.unit_price) }))
          .sort((a, b) => a.minQuantity - b.minQuantity),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  /** Active customers, by name. Also asked for when a quote without one is accepted. */
  async customers(): Promise<CustomerOption[]> {
    const { data, error } = await this.supabase
      .from('customers')
      .select('id, name')
      .eq('active', true)
      .order('name');

    fail(error, 'No pudimos leer los clientes.');
    return data ?? [];
  }

  private async channels(): Promise<ChannelOption[]> {
    const { data, error } = await this.supabase
      .from('sales_channels')
      .select('id, name, commission_rate')
      .eq('active', true)
      .order('name');

    fail(error, 'No pudimos leer los canales de venta.');

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      commissionRate: num(row.commission_rate),
    }));
  }

  private async pendingRequests(): Promise<RequestOption[]> {
    const { data, error } = await this.supabase
      .from('quote_requests')
      .select('id, description, contact, customer_id, channel_id, created_at')
      .in('status', ['new', 'awaiting_slicing'])
      .order('created_at', { ascending: false })
      .limit(20);

    fail(error, 'No pudimos leer los pedidos de cotización.');

    return (data ?? []).map((row) => ({
      id: row.id,
      description: row.description,
      contact: row.contact,
      customerId: row.customer_id,
      channelId: row.channel_id,
      createdAt: row.created_at,
    }));
  }

  /**
   * Loads a variant's production recipe as a draft line: its plates with their
   * filaments and grams, its supplies, and the two labour times.
   */
  async recipeFor(variant: VariantOption, supplies: SupplyOption[]): Promise<LineDraft> {
    const { data: recipes, error } = await this.supabase
      .from('recipes')
      .select('id, setup_minutes, minutes_per_unit, version')
      .eq('variant_id', variant.id)
      .eq('active', true)
      .order('version', { ascending: false })
      .limit(1);

    fail(error, 'No pudimos leer la receta de la variante.');
    const recipe = recipes?.[0];

    if (recipe === undefined) {
      throw new DataError(
        `«${variant.label}» todavía no tiene receta. Cárgala en el catálogo o arma las placas a mano.`,
      );
    }

    const [plates, items] = await Promise.all([
      this.supabase
        .from('recipe_plates')
        .select(
          'id, label, plate_index, units_per_run, print_time_s, source_file_name, recipe_plate_filaments(slot, grams, color_hex, filament_sku_id)',
        )
        .eq('recipe_id', recipe.id)
        .order('plate_index'),
      this.supabase
        .from('recipe_items')
        .select('inventory_item_id, quantity_per_unit')
        .eq('recipe_id', recipe.id),
    ]);

    fail(plates.error, 'No pudimos leer las placas de la receta.');
    fail(items.error, 'No pudimos leer los insumos de la receta.');

    return {
      description: variant.label,
      variantId: variant.id,
      quantity: 1,
      setupMinutes: num(recipe.setup_minutes),
      minutesPerUnit: num(recipe.minutes_per_unit),
      plates: (plates.data ?? []).map((plate) => ({
        label: plate.label ?? `Placa ${plate.plate_index}`,
        printTimeSeconds: num(plate.print_time_s),
        unitsPerRun: num(plate.units_per_run, 1),
        source: 'recipe' as const,
        sourceFileName: plate.source_file_name,
        filaments: (plate.recipe_plate_filaments ?? [])
          .map((filament) => ({
            slot: filament.slot,
            grams: num(filament.grams),
            colorHex: filament.color_hex,
            type: null,
            trayInfoIdx: null,
            filamentSkuId: filament.filament_sku_id,
          }))
          .sort((a, b) => a.slot - b.slot),
      })),
      supplies: (items.data ?? []).map((item) => {
        const supply = supplies.find((option) => option.id === item.inventory_item_id);

        return {
          label: supply?.name ?? 'Insumo',
          inventoryItemId: item.inventory_item_id,
          scope: 'unit' as const,
          quantity: num(item.quantity_per_unit, 1),
          unitCost: supply?.unitCost ?? 0,
        };
      }),
    };
  }

  // ------------------------------------------------------------ writing

  /**
   * Saves a quote with its lines. The number comes from the database so the
   * series has no holes, and a new version reuses the number it comes from.
   */
  async saveQuote(quote: NewQuote): Promise<{ id: string; number: string; version: number }> {
    let number: string;
    let version = 1;
    let parentQuoteId: string | null = null;

    if (quote.previousVersionOf !== null) {
      number = quote.previousVersionOf.number;
      version = quote.previousVersionOf.version + 1;
      parentQuoteId = quote.previousVersionOf.quoteId;
    } else {
      const { data, error } = await this.supabase.rpc('next_document_number', {
        p_workspace: quote.workspaceId,
        p_doc_kind: 'quote',
      });

      fail(error, 'No pudimos reservar un número de cotización.');
      if (typeof data !== 'string' || data === '') {
        throw new DataError('No pudimos reservar un número de cotización.');
      }
      number = data;
    }

    const { data: inserted, error: insertError } = await this.supabase
      .from('quotes')
      .insert({
        workspace_id: quote.workspaceId,
        number,
        version,
        parent_quote_id: parentQuoteId,
        customer_id: quote.customerId,
        channel_id: quote.channelId,
        request_id: quote.requestId,
        status: 'draft',
        valid_until: quote.validUntil,
        cost_profile_snapshot: JSON.parse(JSON.stringify(quote.snapshot)),
        subtotal: quote.subtotal,
        discount: quote.discount,
        igv: quote.igv,
        total: quote.total,
        note: quote.note,
      })
      .select('id, number, version')
      .single();

    fail(insertError, 'No pudimos guardar la cotización.');
    if (inserted === null) throw new DataError('No pudimos guardar la cotización.');

    const { error: linesError } = await this.supabase.from('quote_lines').insert(
      quote.lines.map((line, index) => ({
        workspace_id: quote.workspaceId,
        quote_id: inserted.id,
        position: index + 1,
        kind: line.variantId === null ? ('custom' as const) : ('catalog' as const),
        variant_id: line.variantId,
        description: line.description,
        quantity: line.quantity,
        plates: JSON.parse(JSON.stringify(line.plates)),
        items: JSON.parse(
          JSON.stringify({
            supplies: line.supplies,
            filamentLabels: line.filamentLabels,
            filamentCostPerKg: line.filamentCostPerKg,
          }),
        ),
        setup_minutes: line.setupMinutes,
        minutes_per_unit: line.minutesPerUnit,
        unit_cost: line.unitCost,
        unit_price: line.unitPrice,
      })),
    );

    if (linesError !== null) {
      // A quote with no lines is worse than no quote at all.
      await this.supabase.from('quotes').delete().eq('id', inserted.id);
      throw new DataError(explain(linesError, 'No pudimos guardar las líneas de la cotización.'));
    }

    if (quote.requestId !== null) {
      await this.supabase
        .from('quote_requests')
        .update({ status: 'quoted' })
        .eq('id', quote.requestId);
    }

    return inserted;
  }

  async listQuotes(): Promise<QuoteSummary[]> {
    const { data, error } = await this.supabase
      .from('quotes')
      .select(
        'id, number, version, status, issued_on, valid_until, total, parent_quote_id, customers(name), quote_lines(id)',
      )
      .order('issued_on', { ascending: false })
      .order('number', { ascending: false })
      .order('version', { ascending: false });

    fail(error, 'No pudimos leer las cotizaciones.');

    const rows = data ?? [];
    const latestByNumber = new Map<string, number>();
    for (const row of rows) {
      latestByNumber.set(row.number, Math.max(latestByNumber.get(row.number) ?? 0, row.version));
    }

    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      version: row.version,
      status: row.status,
      customerName: (Array.isArray(row.customers) ? row.customers[0] : row.customers)?.name ?? null,
      issuedOn: row.issued_on,
      validUntil: row.valid_until,
      total: num(row.total),
      lines: (row.quote_lines ?? []).length,
      hasNewerVersion: (latestByNumber.get(row.number) ?? row.version) > row.version,
    }));
  }

  async quote(id: string): Promise<QuoteDetail> {
    const [header, lines, order] = await Promise.all([
      this.supabase
        .from('quotes')
        .select(
          'id, number, version, status, issued_on, valid_until, total, subtotal, discount, igv, note, parent_quote_id, customer_id, channel_id, request_id, cost_profile_snapshot, held_at, hold_until, customers(name), sales_channels(name)',
        )
        .eq('id', id)
        .maybeSingle(),
      this.supabase
        .from('quote_lines')
        .select('*')
        .eq('quote_id', id)
        .order('position'),
      this.supabase
        .from('orders')
        .select('id, number')
        .eq('quote_id', id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    fail(header.error, 'No pudimos leer la cotización.');
    fail(lines.error, 'No pudimos leer las líneas de la cotización.');
    fail(order.error, 'No pudimos leer el pedido de esta cotización.');

    const row = header.data;
    if (row === null || row === undefined) throw new DataError('Esa cotización ya no existe.');

    const { data: siblings } = await this.supabase
      .from('quotes')
      .select('version')
      .eq('number', row.number);

    const latest = (siblings ?? []).reduce((top, item) => Math.max(top, item.version), row.version);

    return {
      id: row.id,
      number: row.number,
      version: row.version,
      status: row.status,
      customerId: row.customer_id,
      customerName: (Array.isArray(row.customers) ? row.customers[0] : row.customers)?.name ?? null,
      channelId: row.channel_id,
      channelName:
        (Array.isArray(row.sales_channels) ? row.sales_channels[0] : row.sales_channels)?.name ??
        null,
      requestId: row.request_id,
      parentQuoteId: row.parent_quote_id,
      issuedOn: row.issued_on,
      validUntil: row.valid_until,
      note: row.note,
      subtotal: num(row.subtotal),
      discount: num(row.discount),
      igv: num(row.igv),
      total: num(row.total),
      lines: (lines.data ?? []).length,
      hasNewerVersion: latest > row.version,
      snapshot: parseSnapshot(row.cost_profile_snapshot),
      heldAt: row.held_at,
      holdUntil: row.hold_until,
      order: order.data?.[0] ?? null,
      storedLines: (lines.data ?? []).map((line) => {
        const items = record(line.items);

        return {
          id: line.id,
          position: line.position,
          kind: line.kind,
          variantId: line.variant_id,
          description: line.description,
          quantity: line.quantity,
          setupMinutes: num(line.setup_minutes),
          minutesPerUnit: num(line.minutes_per_unit),
          unitCost: num(line.unit_cost),
          unitPrice: num(line.unit_price),
          lineTotal: num(line.line_total),
          plates: parsePlates(line.plates),
          supplies: parseSupplies(items['supplies']),
          filamentLabels: parseStringMap(items['filamentLabels']),
          filamentCostPerKg: parseNumberMap(items['filamentCostPerKg']),
        };
      }),
    };
  }

  async setStatus(id: string, status: QuoteStatus): Promise<void> {
    const { error } = await this.supabase.from('quotes').update({ status }).eq('id', id);
    fail(error, 'No pudimos cambiar el estado de la cotización.');
  }

  /**
   * Moves the end of the hold to a concrete moment, or to now to let go of it.
   * The database refuses a quote that is not sent, with a sentence for the
   * person, so it travels as it is.
   */
  async setHold(id: string, until: string | null): Promise<{ heldAt: string | null; holdUntil: string | null }> {
    const { data, error } = await this.supabase.rpc('set_quote_hold', {
      p_quote_id: id,
      // Letting go is a moment already past, which the database turns into its
      // own now. The browser's clock may run a few seconds ahead of it.
      p_until: until ?? LONG_AGO,
    });
    if (error !== null) throw new DataError(friendlyError(error, 'No pudimos cambiar el separo.'));

    return { heldAt: data?.held_at ?? null, holdUntil: data?.hold_until ?? null };
  }

  /** Until when a quote sent right now would hold, by the workshop's own rule. */
  async defaultHoldUntil(): Promise<string | null> {
    const { data, error } = await this.supabase.rpc('default_hold_until', {
      p_workspace_id: await this.workspace.requireId(),
    });
    if (error !== null) return null;
    return data;
  }

  /**
   * The customer said yes: the database creates the order from the quote and
   * closes it, all or nothing. Its refusals (already has an order, no customer)
   * are written for the person and name the case, so they travel as they are.
   */
  async acceptQuote(acceptance: QuoteAcceptance): Promise<{ id: string; number: string }> {
    const { data, error } = await this.supabase.rpc('accept_quote', {
      p_quote_id: acceptance.quoteId,
      p_due_date: acceptance.dueDate ?? undefined,
      p_note: acceptance.note ?? undefined,
      p_customer_id: acceptance.customerId ?? undefined,
    });
    if (error !== null) throw new DataError(friendlyError(error, 'No pudimos crear el pedido.'));
    if (data === null) throw new DataError('No pudimos crear el pedido.');

    return { id: data.id, number: data.number };
  }
}
