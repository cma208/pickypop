import { inject, Injectable } from '@angular/core';
import { UserFacingError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { fetchAll } from '../../core/fetch-all';
import { spoolName, type SpoolIdentity } from '../../core/spool-label';
import { CurrentWorkspace } from '../../core/workspace';
import type { PaymentMethod } from '../finanzas/finanzas.models';
import { dayEnd, dayStart, type ItemKind, type MovementType, type SpoolStatus } from './inventario.format';
import type { AllocationMethod } from '../../core/pricing';

// ------------------------------------------------------------------ types

/**
 * Catalogue entries carry `active` because a deactivated one must stay
 * resolvable: a filament that already uses it still has to show it when edited.
 * Which ones to *offer* is decided by `selectableOptions`, not by the query.
 */
export interface BrandOption {
  id: string;
  name: string;
  active: boolean;
}

export interface MaterialOption {
  id: string;
  code: string;
  active: boolean;
}

export interface FinishOption {
  id: string;
  name: string;
  /** The finish's own flag. Whether a *filament* wears the nozzle is read from the view. */
  abrasive: boolean;
  active: boolean;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export interface SkuSummary {
  id: string;
  brandId: string;
  brandName: string;
  materialId: string;
  materialCode: string;
  finishId: string | null;
  finishName: string | null;
  /** Whether it wears the nozzle, and why. Read from `filament_sku_details`, never recomputed here. */
  abrasive: boolean;
  abrasiveBecause: string | null;
  colorName: string;
  colorHex: string | null;
  diameterMm: number;
  netWeightG: number;
  tareG: number | null;
  minStockG: number;
  replacementCostPerKg: number | null;
  active: boolean;
  /**
   * Grams on the spools. Who they are for is the plan's answer (ADR-021):
   * the view's old `available_g` stopped meaning anything when holds became
   * something computed instead of written.
   */
  onHandG: number;
  weightedCostPerGram: number | null;
  belowMinimum: boolean;
}

export interface SkuInput {
  brandId: string;
  materialId: string;
  finishId: string | null;
  colorName: string;
  colorHex: string | null;
  diameterMm: number;
  netWeightG: number;
  tareG: number | null;
  minStockG: number;
  replacementCostPerKg: number | null;
  active: boolean;
}

export interface SpoolSummary {
  id: string;
  code: string | null;
  skuId: string;
  skuLabel: string;
  /** With the code, what tells two rolls apart wherever one is chosen. */
  materialCode: string | null;
  colorName: string;
  /** Same answer as the filament's: read from `filament_sku_details`. */
  abrasive: boolean;
  abrasiveBecause: string | null;
  colorHex: string | null;
  tareG: number | null;
  status: SpoolStatus;
  location: string | null;
  openedAt: string | null;
  initialWeightG: number;
  remainingG: number;
  unitCost: number;
  costPerGram: number;
}

/** What the scale said. The difference is the database's to work out, against what the roll has then. */
export interface WeighingInput {
  spoolId: string;
  grossG: number;
  tareG: number;
  /** A discarded roll with filament on the scale goes back into use. Without it, the database refuses it. */
  reopen?: boolean;
}

/** What a weighing did: `differenceG` zero means it wrote nothing. */
export interface WeighingResult {
  netG: number;
  /** What the roll had when the weighing was saved, which may differ from what the dialog showed. */
  beforeG: number;
  differenceG: number;
  afterG: number;
  status: SpoolStatus;
}

/** What a change of state moved: the grams a roll still had leave the stock when it is marked empty or discarded. */
export interface SpoolStatusChange {
  status: SpoolStatus;
  changed: boolean;
  removedG: number;
  removedCost: number;
}

export interface PurchaseLineView {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  extra: number;
  /** What the line bought looks like: the item's photo, or the spool's colour. */
  isSpool: boolean;
  imagePath: string | null;
  itemKind: ItemKind | null;
  /** What the quantity of a supply line counts: «g», «unidad». Null for a roll. */
  unit: string | null;
  colorHex: string | null;
}

export interface PurchaseSummary {
  id: string;
  supplierName: string | null;
  purchasedAt: string;
  documentRef: string | null;
  shippingCost: number;
  otherCosts: number;
  allocation: AllocationMethod;
  note: string | null;
  total: number;
  /** Money already paid for it, from the expenses tied to it. */
  paid: number;
  /** What is still owed. Zero once it is paid in full. */
  pending: number;
  spoolCount: number;
  lines: PurchaseLineView[];
}

/**
 * One line as the plan priced it (`planPurchase`): the stored quantity and
 * price, its share of shipping and what each unit ends up costing. The
 * database checks that it adds up before writing it.
 */
export interface PurchaseDraftLine {
  kind: 'sku' | 'item';
  targetId: string;
  quantity: number;
  unitPrice: number;
  extra: number;
  /** Filament lines: the final cost of each roll. */
  unitCosts: number[];
  /** Supply lines: the final cost of one unit. */
  unitCost: number;
  expiresOn: string | null;
}

export interface PurchaseDraft {
  supplierId: string | null;
  purchasedAt: string;
  documentRef: string | null;
  shippingCost: number;
  otherCosts: number;
  /** The method the plan really applied: by weight falls back to amount when no line has a weight. */
  allocation: AllocationMethod;
  note: string | null;
  lines: PurchaseDraftLine[];
  /** How it was paid. Null when it is still to be paid. */
  payment: PurchasePayment | null;
}

export interface PurchasePayment {
  accountId: string;
  /** Null uses the account's own method. */
  method: PaymentMethod | null;
}

export interface PaymentAccount {
  id: string;
  name: string;
  defaultMethod: PaymentMethod | null;
  /** A payment dated before this day is already inside the opening balance and does not move it. */
  openingBalanceOn: string;
}

export interface PurchasePaymentInput extends PurchasePayment {
  purchaseId: string;
  amount: number;
  occurredAt: string;
}

/** What the database says it registered. */
export interface RegisteredPurchase {
  id: string;
  total: number;
  /** Paid on the spot. The payment is part of the same transaction: it went in, or nothing did. */
  paid: number;
  /** The rolls that came in, with the label the database gave each one. */
  spools: SpoolIdentity[];
}

export interface InventoryItemSummary {
  id: string;
  kind: ItemKind;
  name: string;
  unit: string;
  imagePath: string | null;
  minStock: number;
  perishable: boolean;
  note: string | null;
  active: boolean;
  /** What is on the shelf. Who it is for comes from the plan, not from this. */
  onHand: number;
  belowMinimum: boolean;
}

export interface InventoryItemInput {
  kind: ItemKind;
  name: string;
  unit: string;
  imagePath: string | null;
  minStock: number;
  perishable: boolean;
  note: string | null;
  active: boolean;
}

export type ItemMovementMode = 'in' | 'out' | 'count';

/**
 * What the person did: entered, took out, or counted. The movement itself is
 * worked out by the database against what there is when it is saved.
 */
export interface ItemMovementInput {
  itemId: string;
  mode: ItemMovementMode;
  /** Always positive; for a count, what was counted. */
  quantity: number;
  /** Why it went out. Only for `out`. */
  reason: Extract<MovementType, 'consumption' | 'waste'> | null;
  note: string | null;
}

/** What a movement did: `difference` zero means it wrote nothing. */
export interface ItemMovementResult {
  before: number;
  difference: number;
  after: number;
}

export interface MovementFilter {
  type: MovementType | null;
  spoolId: string | null;
  itemId: string | null;
  from: string | null;
  to: string | null;
}

export interface MovementRow {
  id: string;
  occurredAt: string;
  type: MovementType;
  quantity: number;
  unit: string;
  unitCost: number | null;
  sourceType: string | null;
  note: string | null;
  subject: string;
  subjectKind: 'spool' | 'item';
  /** The item's photo, or null for a spool or an item without one. */
  imagePath: string | null;
  /** The article the movement is about, null for a spool. A piece without a photo borrows its plate's. */
  itemId: string | null;
  itemKind: ItemKind | null;
  /** A spool is recognised by its colour, not by a photo. */
  colorHex: string | null;
}

export interface MovementPage {
  rows: MovementRow[];
  truncated: boolean;
}

/** A filament with its brand, material and finish already resolved, as `filament_sku_details` gives it. */
interface SkuDetail {
  colorName: string;
  brandName: string | null;
  materialCode: string | null;
  finishName: string | null;
  abrasive: boolean;
  abrasiveBecause: string | null;
}

// -------------------------------------------------------------- constants

export const MOVEMENTS_LIMIT = 500;

function num(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function numOrNull(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function skuLabel(brand: string | null, material: string | null, finish: string | null, color: string): string {
  return [color, material, finish, brand].filter(Boolean).join(' · ');
}

/**
 * An update that the access rules or a filter leave without rows comes back
 * without an error. Saying «guardado» then would be a lie: the row is gone,
 * or the person may not change it.
 */
function requireRows(rows: unknown[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new UserFacingError(`No se guardó: ${what} ya no está o no tienes permiso para cambiarlo. Recarga la lista.`);
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Everything the inventory screens read and write. Pages never talk to
 * Supabase directly; they get typed domain objects from here. Row Level
 * Security scopes every query to the signed-in person's workshop.
 */
export interface PartStock {
  inventoryItemId: string;
  name: string;
  unit: string;
  imagePath: string | null;
  onHand: number;
  minStock: number;
  belowMinimum: boolean;
  costPerUnit: number | null;
  costSource: string | null;
}

export interface AssemblyOption {
  variantId: string;
  productName: string;
  variantName: string;
  imagePath: string | null;
  /** Unidades ya armadas en el estante. */
  assembledOnHand: number;
  /** Cuántas más alcanzan a armarse con el stock de hoy. */
  buildableUnits: number;
  componentCount: number;
}

/** Un renglón de la receta, con lo que hay y lo que hace falta. */
export interface AssemblyComponent {
  inventoryItemId: string;
  name: string;
  unit: string;
  kind: ItemKind;
  imagePath: string | null;
  quantityPerUnit: number;
  onHand: number;
}

@Injectable({ providedIn: 'root' })
export class InventarioData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  /** Inserts need the workshop id; RLS guarantees we only ever see our own. */
  private workspaceId(): Promise<string> {
    return this.workspace.requireId();
  }


  // ------------------------------------------------------------ catalogues

  async brands(): Promise<BrandOption[]> {
    const { data, error } = await this.supabase.from('brands').select('id, name, active').order('name');
    if (error) throw error;
    return data;
  }

  async materials(): Promise<MaterialOption[]> {
    const { data, error } = await this.supabase.from('materials').select('id, code, active').order('code');
    if (error) throw error;
    return data;
  }

  async finishes(): Promise<FinishOption[]> {
    const { data, error } = await this.supabase
      .from('filament_finishes')
      .select('id, name, abrasive, active')
      .order('name');
    if (error) throw error;
    return data;
  }

  async suppliers(): Promise<SupplierOption[]> {
    const { data, error } = await this.supabase.from('suppliers').select('id, name').order('name');
    if (error) throw error;
    return data;
  }

  async createBrand(name: string): Promise<BrandOption> {
    const workspace_id = await this.workspaceId();
    const { data, error } = await this.supabase
      .from('brands')
      .insert({ workspace_id, name: name.trim() })
      .select('id, name, active')
      .single();
    if (error) throw error;
    return data;
  }

  async createMaterial(code: string): Promise<MaterialOption> {
    const workspace_id = await this.workspaceId();
    const { data, error } = await this.supabase
      .from('materials')
      .insert({ workspace_id, code: code.trim().toUpperCase() })
      .select('id, code, active')
      .single();
    if (error) throw error;
    return data;
  }

  async createSupplier(name: string): Promise<SupplierOption> {
    const workspace_id = await this.workspaceId();
    const { data, error } = await this.supabase
      .from('suppliers')
      .insert({ workspace_id, name: name.trim() })
      .select('id, name')
      .single();
    if (error) throw error;
    return data;
  }

  // -------------------------------------------------------------- filaments

  /**
   * Brand, material, finish and the abrasive verdict all come from
   * `filament_sku_details`: the "does it wear the nozzle" rule lives in that
   * view and nowhere else, so no screen can drift from the others.
   */
  private async skuDetails(): Promise<Map<string, SkuDetail>> {
    const { data, error } = await this.supabase
      .from('filament_sku_details')
      .select('filament_sku_id, color_name, brand_name, material_code, finish_name, abrasive, abrasive_because');
    if (error) throw error;

    return new Map(
      data.flatMap((row) =>
        row.filament_sku_id
          ? [
              [
                row.filament_sku_id,
                {
                  colorName: row.color_name ?? '',
                  brandName: row.brand_name,
                  materialCode: row.material_code,
                  finishName: row.finish_name,
                  abrasive: row.abrasive ?? false,
                  abrasiveBecause: row.abrasive_because,
                },
              ] as const,
            ]
          : [],
      ),
    );
  }

  async skus(): Promise<SkuSummary[]> {
    const [skus, stock, details] = await Promise.all([
      this.supabase
        .from('filament_skus')
        .select(
          'id, brand_id, material_id, finish_id, color_name, color_hex, diameter_mm, net_weight_g, spool_tare_g, min_stock_g, replacement_cost_per_kg, active',
        ),
      this.supabase
        .from('filament_sku_stock')
        .select('filament_sku_id, on_hand_g, weighted_cost_per_gram'),
      this.skuDetails(),
    ]);
    if (skus.error) throw skus.error;
    if (stock.error) throw stock.error;

    const balances = new Map(stock.data.map((row) => [row.filament_sku_id, row]));

    return skus.data
      .map((sku): SkuSummary => {
        const balance = balances.get(sku.id);
        const detail = details.get(sku.id);
        return {
          id: sku.id,
          brandId: sku.brand_id,
          brandName: detail?.brandName ?? '—',
          materialId: sku.material_id,
          materialCode: detail?.materialCode ?? '—',
          finishId: sku.finish_id,
          finishName: detail?.finishName ?? null,
          abrasive: detail?.abrasive ?? false,
          abrasiveBecause: detail?.abrasiveBecause ?? null,
          colorName: sku.color_name,
          colorHex: sku.color_hex,
          diameterMm: num(sku.diameter_mm),
          netWeightG: num(sku.net_weight_g),
          tareG: numOrNull(sku.spool_tare_g),
          minStockG: num(sku.min_stock_g),
          replacementCostPerKg: numOrNull(sku.replacement_cost_per_kg),
          active: sku.active,
          onHandG: num(balance?.on_hand_g),
          weightedCostPerGram: numOrNull(balance?.weighted_cost_per_gram),
          belowMinimum: num(balance?.on_hand_g) < num(sku.min_stock_g),
        };
      })
      .sort((a, b) => a.colorName.localeCompare(b.colorName, 'es'));
  }

  async saveSku(id: string | null, input: SkuInput): Promise<void> {
    const values = {
      brand_id: input.brandId,
      material_id: input.materialId,
      // `finish` (free text) is obsolete and no longer written: the id is the source of truth.
      finish_id: input.finishId,
      color_name: input.colorName.trim(),
      color_hex: input.colorHex,
      diameter_mm: input.diameterMm,
      net_weight_g: input.netWeightG,
      spool_tare_g: input.tareG,
      min_stock_g: input.minStockG,
      replacement_cost_per_kg: input.replacementCostPerKg,
      active: input.active,
    };

    if (id) {
      const { data, error } = await this.supabase.from('filament_skus').update(values).eq('id', id).select('id');
      if (error) throw error;
      requireRows(data, 'el filamento');
      return;
    }

    const workspace_id = await this.workspaceId();
    const { error } = await this.supabase.from('filament_skus').insert({ workspace_id, ...values });
    if (error) throw error;
  }

  // ----------------------------------------------------------------- spools

  /**
   * Every roll the workshop ever bought, emptied ones included: past 1000
   * PostgREST cut the list without a word, and the rolls left out vanished
   * from their filament. Paged by id, so no page repeats or skips a row.
   */
  async spools(): Promise<SpoolSummary[]> {
    const [spools, balances, details] = await Promise.all([
      fetchAll((from, to) =>
        this.supabase
          .from('spools')
          .select(
            'id, code, filament_sku_id, status, location, opened_at, initial_weight_g, unit_cost, cost_per_gram, filament_skus(color_name, color_hex, spool_tare_g)',
          )
          .order('id')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        this.supabase.from('spool_balances').select('spool_id, on_hand_g').order('spool_id').range(from, to),
      ),
      this.skuDetails(),
    ]);

    const remaining = new Map(balances.map((row) => [row.spool_id, num(row.on_hand_g)]));

    return spools
      .map((spool): SpoolSummary => {
        const sku = spool.filament_skus;
        const detail = details.get(spool.filament_sku_id);
        return {
          id: spool.id,
          code: spool.code,
          skuId: spool.filament_sku_id,
          skuLabel: detail
            ? skuLabel(detail.brandName, detail.materialCode, detail.finishName, detail.colorName)
            : 'SKU desconocido',
          materialCode: detail?.materialCode ?? null,
          colorName: detail?.colorName ?? '',
          abrasive: detail?.abrasive ?? false,
          abrasiveBecause: detail?.abrasiveBecause ?? null,
          colorHex: sku?.color_hex ?? null,
          tareG: numOrNull(sku?.spool_tare_g),
          status: spool.status,
          location: spool.location,
          openedAt: spool.opened_at,
          initialWeightG: num(spool.initial_weight_g),
          remainingG: remaining.get(spool.id) ?? 0,
          unitCost: num(spool.unit_cost),
          costPerGram: num(spool.cost_per_gram),
        };
      })
      .sort((a, b) => (a.code ?? '~').localeCompare(b.code ?? '~', 'es', { numeric: true }));
  }

  /**
   * Changes the state of a roll through the database, which refuses it if the
   * roll is no longer in the state the screen showed, and takes out of the
   * stock what an emptied or discarded roll still had.
   */
  async changeSpoolStatus(spool: SpoolSummary, status: SpoolStatus): Promise<SpoolStatusChange> {
    const { data, error } = await this.supabase.rpc('set_spool_status', {
      p_spool_id: spool.id,
      p_status: status,
      p_expected: spool.status,
    });
    if (error) throw error;

    const result = jsonObject(data);
    return {
      status: (result['status'] as SpoolStatus | undefined) ?? status,
      changed: result['changed'] === true,
      removedG: num(result['removed_g'] as number | null),
      removedCost: num(result['removed_cost'] as number | null),
    };
  }

  async updateSpoolLabel(id: string, code: string | null, location: string | null): Promise<void> {
    const { data, error } = await this.supabase.from('spools').update({ code, location }).eq('id', id).select('id');
    if (error) throw error;
    requireRows(data, 'el rollo');
  }

  /**
   * A weighing sends what the scale said. The database takes the difference
   * against what the roll has at that moment and writes it as an
   * `adjustment`, so stock stays a sum of movements and a second save from an
   * old tab writes nothing (T3-02).
   */
  async recordWeighing(input: WeighingInput): Promise<WeighingResult> {
    const { data, error } = await this.supabase.rpc('weigh_spool', {
      p_spool_id: input.spoolId,
      p_gross_g: input.grossG,
      p_tare_g: input.tareG,
      p_reopen: input.reopen ?? false,
    });
    if (error) throw error;

    const result = jsonObject(data);
    return {
      netG: num(result['net_g'] as number | null),
      beforeG: num(result['before_g'] as number | null),
      differenceG: num(result['difference_g'] as number | null),
      afterG: num(result['after_g'] as number | null),
      status: (result['status'] as SpoolStatus | undefined) ?? 'open',
    };
  }

  // -------------------------------------------------------------- purchases

  /**
   * Every purchase, newest first. Past 1000 PostgREST cut the oldest without a
   * word; the id breaks ties so that a page never repeats or skips one.
   */
  async purchases(): Promise<PurchaseSummary[]> {
    const [purchases, details, items, payments] = await Promise.all([
      fetchAll((from, to) =>
        this.supabase
          .from('purchases')
          .select(
            'id, purchased_at, document_ref, shipping_cost, other_costs, allocation, note, suppliers(name), purchase_lines(id, filament_sku_id, inventory_item_id, description, quantity, unit_price, allocated_extra_cost, spools(count), filament_skus(color_hex), inventory_items(kind, image_path, unit))',
          )
          .order('purchased_at', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      ),
      this.skuDetails(),
      fetchAll((from, to) => this.supabase.from('inventory_items').select('id, name').order('id').range(from, to)),
      fetchAll((from, to) =>
        this.supabase
          .from('purchase_payment_status')
          .select('purchase_id, total, paid, pending')
          .order('purchase_id')
          .range(from, to),
      ),
    ]);
    const paymentOf = new Map(payments.map((row) => [row.purchase_id, row]));

    const skuNames = new Map(
      [...details].map(([id, sku]) => [id, skuLabel(sku.brandName, sku.materialCode, sku.finishName, sku.colorName)]),
    );
    const itemNames = new Map(items.map((item) => [item.id, item.name]));

    return purchases.map((purchase): PurchaseSummary => {
      const lines = purchase.purchase_lines.map((line): PurchaseLineView => ({
        id: line.id,
        label:
          (line.filament_sku_id ? skuNames.get(line.filament_sku_id) : null) ??
          (line.inventory_item_id ? itemNames.get(line.inventory_item_id) : null) ??
          line.description ??
          'Línea sin nombre',
        quantity: num(line.quantity),
        unitPrice: num(line.unit_price),
        extra: num(line.allocated_extra_cost),
        isSpool: line.filament_sku_id !== null,
        imagePath: line.inventory_items?.image_path ?? null,
        itemKind: line.inventory_items?.kind ?? null,
        unit: line.inventory_items?.unit ?? null,
        colorHex: line.filament_skus?.color_hex ?? null,
      }));

      const spoolCount = purchase.purchase_lines.reduce(
        (sum, line) => sum + (line.spools[0]?.count ?? 0),
        0,
      );

      return {
        id: purchase.id,
        supplierName: purchase.suppliers?.name ?? null,
        purchasedAt: purchase.purchased_at,
        documentRef: purchase.document_ref,
        shippingCost: num(purchase.shipping_cost),
        otherCosts: num(purchase.other_costs),
        allocation: purchase.allocation,
        note: purchase.note,
        // The database's total, the one the purchase is paid by: adding it up
        // again here could disagree with it by a cent.
        total: num(paymentOf.get(purchase.id)?.total),
        paid: num(paymentOf.get(purchase.id)?.paid),
        pending: num(paymentOf.get(purchase.id)?.pending),
        spoolCount,
        lines,
      };
    });
  }

  /** Accounts that money can leave from, with the method each one uses by default. */
  async paymentAccounts(): Promise<PaymentAccount[]> {
    const { data, error } = await this.supabase
      .from('accounts')
      .select('id, name, default_payment_method, opening_balance_on')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      defaultMethod: row.default_payment_method,
      openingBalanceOn: row.opening_balance_on,
    }));
  }

  /**
   * Pays for a purchase through the database rule, which writes the expense and
   * refuses to pay more than is owed. Its refusals are worded for the person,
   * with the exact amounts, so they travel as they are.
   */
  async recordPurchasePayment(input: PurchasePaymentInput, key: string): Promise<void> {
    const { error } = await this.supabase.rpc('record_purchase_payment', {
      p_purchase_id: input.purchaseId,
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_payment_method: input.method ?? undefined,
      p_occurred_at: input.occurredAt,
      p_payment_key: key,
    });
    if (error) throw error;
  }

  /**
   * Registers a purchase in one transaction of the database
   * (`register_purchase`): the purchase, its lines, a roll per filament with
   * the label the database gives it, the movements that put it all on the
   * shelf and, when it was paid on the spot, the payment. It all goes in or
   * nothing does, so there is nothing left to undo.
   *
   * `key` names the purchase: asked twice (a double click, an answer lost on
   * the way back), the database returns the one it already made.
   */
  async registerPurchase(draft: PurchaseDraft, key: string): Promise<RegisteredPurchase> {
    const workspace_id = await this.workspaceId();
    const { data, error } = await this.supabase.rpc('register_purchase', {
      p_workspace_id: workspace_id,
      p_lines: draft.lines.map((line) =>
        line.kind === 'sku'
          ? {
              filament_sku_id: line.targetId,
              quantity: line.quantity,
              unit_price: line.unitPrice,
              allocated_extra_cost: line.extra,
              unit_costs: line.unitCosts,
            }
          : {
              inventory_item_id: line.targetId,
              quantity: line.quantity,
              unit_price: line.unitPrice,
              allocated_extra_cost: line.extra,
              unit_cost: line.unitCost,
              expires_on: line.expiresOn,
            },
      ),
      p_purchased_at: draft.purchasedAt,
      p_supplier_id: draft.supplierId ?? undefined,
      p_document_ref: draft.documentRef ?? undefined,
      p_shipping_cost: draft.shippingCost,
      p_other_costs: draft.otherCosts,
      p_allocation: draft.allocation,
      p_note: draft.note ?? undefined,
      p_account_id: draft.payment?.accountId,
      p_payment_method: draft.payment?.method ?? undefined,
      p_purchase_key: key,
    });
    if (error) throw error;

    const receipt = jsonObject(data);
    const spools = Array.isArray(receipt['spools']) ? receipt['spools'] : [];
    return {
      id: String(receipt['purchase_id'] ?? ''),
      total: num(receipt['total'] as number | null),
      paid: num(receipt['paid'] as number | null),
      spools: spools.map((value) => {
        const spool = jsonObject(value);
        return {
          code: (spool['code'] as string | null) ?? null,
          materialCode: (spool['material_code'] as string | null) ?? null,
          colorName: (spool['color_name'] as string | null) ?? null,
        };
      }),
    };
  }

  // ------------------------------------------------------------------ items

  async items(): Promise<InventoryItemSummary[]> {
    const [items, balances] = await Promise.all([
      this.supabase.from('inventory_items').select('id, kind, name, unit, image_path, min_stock, perishable, note, active'),
      this.supabase.from('inventory_balances').select('inventory_item_id, on_hand'),
    ]);
    if (items.error) throw items.error;
    if (balances.error) throw balances.error;

    const byId = new Map(balances.data.map((row) => [row.inventory_item_id, row]));

    return items.data
      .map((item): InventoryItemSummary => {
        const balance = byId.get(item.id);
        const onHand = num(balance?.on_hand);
        return {
          id: item.id,
          kind: item.kind,
          name: item.name,
          unit: item.unit,
          imagePath: item.image_path,
          minStock: num(item.min_stock),
          perishable: item.perishable,
          note: item.note,
          active: item.active,
          onHand,
          belowMinimum: item.active && onHand < num(item.min_stock),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** Switches an article on or off and leaves the rest of it as it is. */
  async setItemActive(id: string, active: boolean): Promise<void> {
    const { data, error } = await this.supabase.from('inventory_items').update({ active }).eq('id', id).select('id');
    if (error) throw error;
    requireRows(data, 'el artículo');
  }

  async saveItem(id: string | null, input: InventoryItemInput): Promise<void> {
    const values = {
      kind: input.kind,
      name: input.name.trim(),
      unit: input.unit.trim(),
      min_stock: input.minStock,
      perishable: input.perishable,
      note: input.note,
      active: input.active,
      image_path: input.imagePath,
    };

    if (id) {
      const { data, error } = await this.supabase.from('inventory_items').update(values).eq('id', id).select('id');
      if (error) throw error;
      requireRows(data, 'el artículo');
      return;
    }

    const workspace_id = await this.workspaceId();
    const { error } = await this.supabase.from('inventory_items').insert({ workspace_id, ...values });
    if (error) throw error;
  }

  /**
   * A movement by hand of a supply, a bag or a spare part. The database works
   * out what to write against what there is when it is saved: a count from an
   * old tab, or one with an assembly in between, still leaves the shelf at
   * what was counted.
   *
   * `key` names the request: asked again with it (an answer lost on the way
   * back), the database returns its first answer and moves nothing.
   */
  async recordItemMovement(input: ItemMovementInput, key: string): Promise<ItemMovementResult> {
    const { data, error } = await this.supabase.rpc('move_item_stock', {
      p_item_id: input.itemId,
      p_mode: input.mode,
      p_quantity: input.quantity,
      p_reason: input.reason ?? undefined,
      p_note: input.note ?? undefined,
      p_request_key: key,
    });
    if (error) throw error;

    const result = jsonObject(data);
    return {
      before: num(result['before'] as number | null),
      difference: num(result['difference'] as number | null),
      after: num(result['after'] as number | null),
    };
  }

  // -------------------------------------------------------------- movements

  async movements(filter: MovementFilter): Promise<MovementPage> {
    let query = this.supabase
      .from('stock_movements')
      .select(
        'id, occurred_at, type, quantity, unit_cost, source_type, note, spool_id, inventory_item_id, spools(code, filament_skus(color_name, color_hex, materials(code))), inventory_items(name, unit, kind, image_path)',
      )
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(MOVEMENTS_LIMIT + 1);

    if (filter.type) query = query.eq('type', filter.type);
    if (filter.spoolId) query = query.eq('spool_id', filter.spoolId);
    if (filter.itemId) query = query.eq('inventory_item_id', filter.itemId);
    if (filter.from) query = query.gte('occurred_at', dayStart(filter.from));
    if (filter.to) query = query.lte('occurred_at', dayEnd(filter.to));

    const { data, error } = await query;
    if (error) throw error;

    const rows = data.slice(0, MOVEMENTS_LIMIT).map((row): MovementRow => {
      const isSpool = row.spool_id !== null;
      const sku = row.spools?.filament_skus;
      const rollName = row.spools
        ? spoolName({ code: row.spools.code, materialCode: sku?.materials?.code, colorName: sku?.color_name })
        : '';

      return {
        id: row.id,
        occurredAt: row.occurred_at,
        type: row.type,
        quantity: num(row.quantity),
        unit: isSpool ? 'g' : (row.inventory_items?.unit ?? 'u.'),
        unitCost: numOrNull(row.unit_cost),
        sourceType: row.source_type,
        note: row.note,
        subject: isSpool ? `Rollo ${rollName || 'sin código'}` : (row.inventory_items?.name ?? 'Artículo'),
        subjectKind: isSpool ? 'spool' : 'item',
        imagePath: isSpool ? null : (row.inventory_items?.image_path ?? null),
        itemId: row.inventory_item_id,
        itemKind: isSpool ? null : (row.inventory_items?.kind ?? null),
        colorHex: isSpool ? (row.spools?.filament_skus?.color_hex ?? null) : null,
      };
    });

    return { rows, truncated: data.length > MOVEMENTS_LIMIT };
  }

  /** Las piezas impresas en el estante. El stock sale de sus movimientos. */
  async partStock(): Promise<PartStock[]> {
    const { data, error } = await this.supabase
      .from('part_stock')
      .select('inventory_item_id, name, unit, image_path, on_hand, min_stock, below_minimum, cost_per_unit, cost_source')
      .order('name');
    if (error) throw error;

    return (data ?? []).map((row) => ({
      inventoryItemId: row.inventory_item_id!,
      name: row.name!,
      unit: row.unit!,
      imagePath: row.image_path,
      onHand: Number(row.on_hand ?? 0),
      minStock: Number(row.min_stock ?? 0),
      belowMinimum: row.below_minimum ?? false,
      costPerUnit: row.cost_per_unit === null ? null : Number(row.cost_per_unit),
      costSource: row.cost_source,
    }));
  }

  /** Las variantes que tienen receta: lo único que se puede armar. */
  /** Lo que se puede armar, con cuántas hay y cuántas más alcanzan. */
  async assemblyOptions(): Promise<AssemblyOption[]> {
    const { data, error } = await this.supabase
      .from('assembly_options')
      .select('variant_id, product_name, variant_name, image_path, assembled_on_hand, buildable_units, component_count')
      .order('product_name');
    if (error) throw error;

    return (data ?? []).map((row) => ({
      variantId: row.variant_id!,
      productName: row.product_name ?? 'Producto',
      variantName: row.variant_name ?? '',
      imagePath: row.image_path,
      assembledOnHand: num(row.assembled_on_hand),
      buildableUnits: num(row.buildable_units),
      componentCount: num(row.component_count),
    }));
  }

  /** La receta vigente de una variante, con el stock de cada componente. */
  async assemblyComponents(variantId: string): Promise<AssemblyComponent[]> {
    const { data, error } = await this.supabase
      .from('assembly_components')
      .select('inventory_item_id, name, unit, kind, image_path, quantity_per_unit, on_hand')
      .eq('variant_id', variantId)
      .order('name');
    if (error) throw error;

    return (data ?? []).map((row) => ({
      inventoryItemId: row.inventory_item_id!,
      name: row.name ?? '',
      unit: row.unit ?? 'unidad',
      kind: (row.kind ?? 'supply') as ItemKind,
      imagePath: row.image_path,
      quantityPerUnit: num(row.quantity_per_unit),
      onHand: num(row.on_hand),
    }));
  }

  async assemble(variantId: string, units: number): Promise<void> {
    const { error } = await this.supabase.rpc('assemble_product', {
      p_variant_id: variantId,
      p_units: units,
    });
    if (error) throw error;
  }
}
