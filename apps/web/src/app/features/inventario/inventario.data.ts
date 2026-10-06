import { inject, Injectable } from '@angular/core';
import { sumMoney } from '../../core/pricing';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { dayEnd, dayStart, todayIso, type ItemKind, type MovementType, type SpoolStatus } from './inventario.format';
import type { AllocationMethod, PurchasePlan } from '../../core/pricing';

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
  onHandG: number;
  availableG: number;
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

export interface WeighingInput {
  spoolId: string;
  differenceG: number;
  grossG: number;
  tareG: number;
  theoreticalG: number;
  costPerGram: number;
}

export interface PurchaseLineView {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  extra: number;
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
  spoolCount: number;
  lines: PurchaseLineView[];
}

export interface PurchaseDraftLine {
  kind: 'sku' | 'item';
  targetId: string;
  quantity: number;
  unitPrice: number;
  expiresOn: string | null;
  /** SKU lines only: what each spool weighs and how to label it. */
  netWeightG: number | null;
  colorName: string | null;
}

export interface PurchaseDraft {
  supplierId: string | null;
  purchasedAt: string;
  documentRef: string | null;
  shippingCost: number;
  otherCosts: number;
  note: string | null;
  lines: PurchaseDraftLine[];
  plan: PurchasePlan;
}

export interface InventoryItemSummary {
  id: string;
  kind: ItemKind;
  name: string;
  unit: string;
  minStock: number;
  perishable: boolean;
  note: string | null;
  active: boolean;
  onHand: number;
  available: number;
  belowMinimum: boolean;
}

export interface InventoryItemInput {
  kind: ItemKind;
  name: string;
  unit: string;
  minStock: number;
  perishable: boolean;
  note: string | null;
  active: boolean;
}

export interface ItemMovementInput {
  itemId: string;
  type: MovementType;
  /** Signed: positive adds stock, negative removes it. */
  quantity: number;
  note: string | null;
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

/** Thrown when a purchase was saved only in part. Says exactly what exists now. */
export class PartialPurchaseError extends Error {
  constructor(
    readonly purchaseId: string | null,
    readonly spoolIds: string[],
    readonly created: string[],
    readonly failedStep: string,
    override readonly cause: unknown,
  ) {
    super(`Purchase saved partially; failed at: ${failedStep}`);
  }
}

// -------------------------------------------------------------- constants

export const MOVEMENTS_LIMIT = 500;
const SPOOL_CODE_PADDING = 2;
const SPOOL_CODE_PREFIX_LENGTH = 6;
const COST_DECIMALS = 1_000_000;
const NOON_LIMA_OFFSET = 'T12:00:00-05:00';

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
 * Everything the inventory screens read and write. Pages never talk to
 * Supabase directly; they get typed domain objects from here. Row Level
 * Security scopes every query to the signed-in person's workshop.
 */
export interface PartStock {
  inventoryItemId: string;
  name: string;
  unit: string;
  onHand: number;
  minStock: number;
  belowMinimum: boolean;
  costPerUnit: number | null;
  costSource: string | null;
}

export interface AssemblyOption {
  variantId: string;
  label: string;
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
        .select('filament_sku_id, on_hand_g, available_g, weighted_cost_per_gram, below_minimum'),
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
          availableG: num(balance?.available_g),
          weightedCostPerGram: numOrNull(balance?.weighted_cost_per_gram),
          belowMinimum: balance?.below_minimum ?? false,
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
      const { error } = await this.supabase.from('filament_skus').update(values).eq('id', id);
      if (error) throw error;
      return;
    }

    const workspace_id = await this.workspaceId();
    const { error } = await this.supabase.from('filament_skus').insert({ workspace_id, ...values });
    if (error) throw error;
  }

  // ----------------------------------------------------------------- spools

  async spools(): Promise<SpoolSummary[]> {
    const [spools, balances, details] = await Promise.all([
      this.supabase
        .from('spools')
        .select(
          'id, code, filament_sku_id, status, location, opened_at, initial_weight_g, unit_cost, cost_per_gram, filament_skus(color_name, color_hex, spool_tare_g)',
        ),
      this.supabase.from('spool_balances').select('spool_id, on_hand_g'),
      this.skuDetails(),
    ]);
    if (spools.error) throw spools.error;
    if (balances.error) throw balances.error;

    const remaining = new Map(balances.data.map((row) => [row.spool_id, num(row.on_hand_g)]));

    return spools.data
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

  async changeSpoolStatus(spool: SpoolSummary, status: SpoolStatus): Promise<void> {
    const startsBeingUsed = status === 'open' || status === 'in_use';
    const values: { status: SpoolStatus; opened_at?: string } = { status };
    if (startsBeingUsed && !spool.openedAt) values.opened_at = new Date().toISOString();

    const { error } = await this.supabase.from('spools').update(values).eq('id', spool.id);
    if (error) throw error;
  }

  async updateSpoolLabel(id: string, code: string | null, location: string | null): Promise<void> {
    const { error } = await this.supabase.from('spools').update({ code, location }).eq('id', id);
    if (error) throw error;
  }

  /** A weighing becomes an `adjustment` movement for the difference, so stock stays a sum of movements. */
  async recordWeighing(input: WeighingInput): Promise<void> {
    const workspace_id = await this.workspaceId();
    const { error } = await this.supabase.from('stock_movements').insert({
      workspace_id,
      type: 'adjustment',
      spool_id: input.spoolId,
      quantity: input.differenceG,
      unit_cost: input.costPerGram,
      source_type: 'weighing',
      note: `Pesaje: ${input.grossG} g en balanza, tara ${input.tareG} g, esperado ${input.theoreticalG} g`,
    });
    if (error) throw error;
  }

  // -------------------------------------------------------------- purchases

  async purchases(): Promise<PurchaseSummary[]> {
    const [purchases, details, items] = await Promise.all([
      this.supabase
        .from('purchases')
        .select(
          'id, purchased_at, document_ref, shipping_cost, other_costs, allocation, note, suppliers(name), purchase_lines(id, filament_sku_id, inventory_item_id, description, quantity, unit_price, allocated_extra_cost, spools(count))',
        )
        .order('purchased_at', { ascending: false })
        .order('created_at', { ascending: false }),
      this.skuDetails(),
      this.supabase.from('inventory_items').select('id, name'),
    ]);
    if (purchases.error) throw purchases.error;
    if (items.error) throw items.error;

    const skuNames = new Map(
      [...details].map(([id, sku]) => [id, skuLabel(sku.brandName, sku.materialCode, sku.finishName, sku.colorName)]),
    );
    const itemNames = new Map(items.data.map((item) => [item.id, item.name]));

    return purchases.data.map((purchase): PurchaseSummary => {
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
        total: sumMoney([
          ...lines.map((line) => line.quantity * line.unitPrice),
          num(purchase.shipping_cost),
          num(purchase.other_costs),
        ]),
        spoolCount,
        lines,
      };
    });
  }

  /**
   * Saves a purchase in the only order the foreign keys allow: the purchase,
   * its lines, the spools, and finally the movements that put stock on the
   * shelf. Ids are generated here so each step is a single bulk insert. If a
   * step fails, the error says what already exists.
   */
  async registerPurchase(draft: PurchaseDraft): Promise<string> {
    const workspace_id = await this.workspaceId();
    const spoolCodes = await this.nextSpoolCodes(draft.lines);

    const purchaseId = crypto.randomUUID();
    const created: string[] = [];
    const spoolIds: string[] = [];
    let step = 'la compra';

    try {
      const purchase = await this.supabase.from('purchases').insert({
        id: purchaseId,
        workspace_id,
        supplier_id: draft.supplierId,
        purchased_at: draft.purchasedAt,
        document_ref: draft.documentRef,
        shipping_cost: draft.shippingCost,
        other_costs: draft.otherCosts,
        allocation: draft.plan.method,
        note: draft.note,
      });
      if (purchase.error) throw purchase.error;
      created.push('la compra');

      step = 'las líneas de la compra';
      const lineIds = draft.lines.map(() => crypto.randomUUID());
      const lines = await this.supabase.from('purchase_lines').insert(
        draft.lines.map((line, index) => ({
          id: lineIds[index],
          workspace_id,
          purchase_id: purchaseId,
          filament_sku_id: line.kind === 'sku' ? line.targetId : null,
          inventory_item_id: line.kind === 'item' ? line.targetId : null,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          allocated_extra_cost: draft.plan.lines[index].extra,
          expires_on: line.expiresOn,
        })),
      );
      if (lines.error) throw lines.error;
      created.push('las líneas de la compra');

      const spools = this.spoolRows(draft, lineIds, spoolCodes, workspace_id);
      if (spools.length > 0) {
        step = 'los rollos';
        const result = await this.supabase.from('spools').insert(spools);
        if (result.error) throw result.error;
        spoolIds.push(...spools.map((spool) => spool.id));
        created.push(`${spools.length} rollo(s)`);
      }

      step = 'los movimientos de stock';
      const movements = await this.supabase
        .from('stock_movements')
        .insert(this.movementRows(draft, purchaseId, spools, workspace_id));
      if (movements.error) throw movements.error;
    } catch (error) {
      const exists = created.length > 0;
      throw new PartialPurchaseError(exists ? purchaseId : null, spoolIds, created, step, error);
    }

    return purchaseId;
  }

  /** Removes what a failed `registerPurchase` left behind: movements, spools, then the purchase (lines cascade). */
  async undoPurchase(purchaseId: string, spoolIds: string[]): Promise<void> {
    const movements = await this.supabase
      .from('stock_movements')
      .delete()
      .eq('source_type', 'purchase')
      .eq('source_id', purchaseId);
    if (movements.error) throw movements.error;

    if (spoolIds.length > 0) {
      const spools = await this.supabase.from('spools').delete().in('id', spoolIds);
      if (spools.error) throw spools.error;
    }

    const purchase = await this.supabase.from('purchases').delete().eq('id', purchaseId);
    if (purchase.error) throw purchase.error;
  }

  private spoolRows(draft: PurchaseDraft, lineIds: string[], codes: Map<number, string[]>, workspace_id: string) {
    return draft.lines.flatMap((line, lineIndex) => {
      if (line.kind !== 'sku' || line.netWeightG === null) return [];
      const unitCosts = draft.plan.lines[lineIndex].unitCosts;

      return unitCosts.map((unitCost, unitIndex) => ({
        id: crypto.randomUUID(),
        workspace_id,
        filament_sku_id: line.targetId,
        purchase_line_id: lineIds[lineIndex],
        code: codes.get(lineIndex)?.[unitIndex] ?? null,
        initial_weight_g: line.netWeightG as number,
        unit_cost: unitCost,
        status: 'sealed' as const,
      }));
    });
  }

  private movementRows(
    draft: PurchaseDraft,
    purchaseId: string,
    spools: ReturnType<InventarioData['spoolRows']>,
    workspace_id: string,
  ) {
    // Always explicit: a bulk insert with `undefined` here is sent as null and rejected.
    const occurred_at =
      draft.purchasedAt === todayIso() ? new Date().toISOString() : `${draft.purchasedAt}${NOON_LIMA_OFFSET}`;

    const spoolMovements = spools.map((spool) => ({
      workspace_id,
      occurred_at,
      type: 'purchase' as const,
      spool_id: spool.id,
      quantity: spool.initial_weight_g,
      unit_cost: Math.round((spool.unit_cost / spool.initial_weight_g) * COST_DECIMALS) / COST_DECIMALS,
      source_type: 'purchase',
      source_id: purchaseId,
      note: 'Ingreso del rollo',
    }));

    const itemMovements = draft.lines.flatMap((line, index) =>
      line.kind === 'item'
        ? [
            {
              workspace_id,
              occurred_at,
              type: 'purchase' as const,
              inventory_item_id: line.targetId,
              quantity: line.quantity,
              unit_cost: draft.plan.lines[index].effectiveUnitCost,
              source_type: 'purchase',
              source_id: purchaseId,
              note: 'Ingreso por compra',
            },
          ]
        : [],
    );

    return [...spoolMovements, ...itemMovements];
  }

  /** Shelf labels like ROJO-03: the next free number for each colour, per purchase line. */
  private async nextSpoolCodes(lines: PurchaseDraftLine[]): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();
    const nextByPrefix = new Map<string, number>();

    for (const [index, line] of lines.entries()) {
      if (line.kind !== 'sku') continue;

      const prefix = codePrefix(line.colorName);
      if (!nextByPrefix.has(prefix)) nextByPrefix.set(prefix, await this.lastCodeNumber(prefix));

      const codes: string[] = [];
      for (let unit = 0; unit < Math.round(line.quantity); unit++) {
        const next = (nextByPrefix.get(prefix) ?? 0) + 1;
        nextByPrefix.set(prefix, next);
        codes.push(`${prefix}-${String(next).padStart(SPOOL_CODE_PADDING, '0')}`);
      }
      result.set(index, codes);
    }

    return result;
  }

  private async lastCodeNumber(prefix: string): Promise<number> {
    const { data, error } = await this.supabase.from('spools').select('code').ilike('code', `${prefix}-%`);
    if (error) throw error;

    return data.reduce((highest, row) => {
      const match = /-(\d+)$/.exec(row.code ?? '');
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
  }

  // ------------------------------------------------------------------ items

  async items(): Promise<InventoryItemSummary[]> {
    const [items, balances] = await Promise.all([
      this.supabase.from('inventory_items').select('id, kind, name, unit, min_stock, perishable, note, active'),
      this.supabase.from('inventory_balances').select('inventory_item_id, on_hand, available'),
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
          minStock: num(item.min_stock),
          perishable: item.perishable,
          note: item.note,
          active: item.active,
          onHand,
          available: num(balance?.available),
          belowMinimum: item.active && onHand < num(item.min_stock),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
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
    };

    if (id) {
      const { error } = await this.supabase.from('inventory_items').update(values).eq('id', id);
      if (error) throw error;
      return;
    }

    const workspace_id = await this.workspaceId();
    const { error } = await this.supabase.from('inventory_items').insert({ workspace_id, ...values });
    if (error) throw error;
  }

  async recordItemMovement(input: ItemMovementInput): Promise<void> {
    const workspace_id = await this.workspaceId();
    const { error } = await this.supabase.from('stock_movements').insert({
      workspace_id,
      type: input.type,
      inventory_item_id: input.itemId,
      quantity: input.quantity,
      source_type: 'manual',
      note: input.note,
    });
    if (error) throw error;
  }

  // -------------------------------------------------------------- movements

  async movements(filter: MovementFilter): Promise<MovementPage> {
    let query = this.supabase
      .from('stock_movements')
      .select(
        'id, occurred_at, type, quantity, unit_cost, source_type, note, spool_id, inventory_item_id, spools(code, filament_skus(color_name)), inventory_items(name, unit)',
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
      const spoolName = [row.spools?.code, row.spools?.filament_skus?.color_name].filter(Boolean).join(' · ');

      return {
        id: row.id,
        occurredAt: row.occurred_at,
        type: row.type,
        quantity: num(row.quantity),
        unit: isSpool ? 'g' : (row.inventory_items?.unit ?? 'u.'),
        unitCost: numOrNull(row.unit_cost),
        sourceType: row.source_type,
        note: row.note,
        subject: isSpool ? `Rollo ${spoolName || 'sin código'}` : (row.inventory_items?.name ?? 'Artículo'),
        subjectKind: isSpool ? 'spool' : 'item',
      };
    });

    return { rows, truncated: data.length > MOVEMENTS_LIMIT };
  }

  /** Las piezas impresas en el estante. El stock sale de sus movimientos. */
  async partStock(): Promise<PartStock[]> {
    const { data, error } = await this.supabase
      .from('part_stock')
      .select('inventory_item_id, name, unit, on_hand, min_stock, below_minimum, cost_per_unit, cost_source')
      .order('name');
    if (error) throw error;

    return (data ?? []).map((row) => ({
      inventoryItemId: row.inventory_item_id!,
      name: row.name!,
      unit: row.unit!,
      onHand: Number(row.on_hand ?? 0),
      minStock: Number(row.min_stock ?? 0),
      belowMinimum: row.below_minimum ?? false,
      costPerUnit: row.cost_per_unit === null ? null : Number(row.cost_per_unit),
      costSource: row.cost_source,
    }));
  }

  /** Las variantes que tienen receta: lo único que se puede armar. */
  async assemblyOptions(): Promise<AssemblyOption[]> {
    const { data, error } = await this.supabase
      .from('recipes')
      .select('variant_id, product_variants(name, catalog_products(name))')
      .order('variant_id');
    if (error) throw error;

    const seen = new Set<string>();
    const options: AssemblyOption[] = [];
    for (const row of data ?? []) {
      const variantId = row.variant_id;
      if (!variantId || seen.has(variantId)) continue;
      seen.add(variantId);
      const variant = row.product_variants;
      const product = variant?.catalog_products;
      options.push({
        variantId,
        label: [product?.name, variant?.name].filter(Boolean).join(' · ') || 'Variante',
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  /**
   * Arma unidades de una variante. La base valida que alcance y, si no,
   * devuelve un mensaje escrito para una persona que se muestra tal cual.
   */
  async assemble(variantId: string, units: number): Promise<void> {
    const { error } = await this.supabase.rpc('assemble_product', {
      p_variant_id: variantId,
      p_units: units,
    });
    if (error) throw error;
  }
}

function codePrefix(colorName: string | null): string {
  const cleaned = (colorName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, SPOOL_CODE_PREFIX_LENGTH) || 'ROLLO';
}
