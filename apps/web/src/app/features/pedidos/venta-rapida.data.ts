import { inject, Injectable } from '@angular/core';
import { fetchAll } from '../../core/fetch-all';
import { UserFacingError } from '../../core/friendly-error';
import { PlanService } from '../../core/plan';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import {
  shelfOffers,
  type ChannelOptions,
  type CustomerChoice,
  type QuickSalePayload,
  type ShelfOffer,
  type VariantInfo,
} from './quick-sale';

/** SQLSTATE of a `raise exception` in plpgsql: a message written for a person. */
const RAISED_BY_DATABASE = 'P0001';

/** The order as `quick_sale` leaves it: delivered, and paid, partly paid or unpaid. */
export interface SoldOrder {
  id: string;
  number: string;
  total: number;
}

/** Data access for «Venta rápida» (ADR-024). The page never talks to Supabase directly. */
@Injectable({ providedIn: 'root' })
export class QuickSaleData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly planner = inject(PlanService);

  /**
   * What can be sold now, by the plan's account of the shelf (ADR-021).
   * `fresh` reads the plan again instead of the one shared between screens:
   * right before selling, a few seconds can be the last basket.
   */
  async offers(fresh = false): Promise<ShelfOffer[]> {
    if (fresh) this.planner.invalidate();
    const [view, variants, costs] = await Promise.all([this.planner.current(), this.variants(), this.shelfCosts()]);
    return shelfOffers(view, variants, costs);
  }

  /**
   * The active channels and the one preselected: the workshop's default, the
   * one that stands for direct sales (`default_channel`). The database
   * applies the same default when a sale names none.
   */
  async channels(): Promise<ChannelOptions> {
    const workspaceId = await this.workspace.requireId();
    const [list, chosen] = await Promise.all([
      this.supabase.from('sales_channels').select('id, name').eq('active', true).order('name'),
      this.supabase.rpc('default_channel', { p_workspace_id: workspaceId }),
    ]);
    if (list.error) throw list.error;
    if (chosen.error) throw chosen.error;

    const channels = list.data.map((row) => ({ id: row.id, name: row.name }));
    const defaultId = channels.some((channel) => channel.id === chosen.data) ? chosen.data : null;
    return { channels, defaultId };
  }

  /**
   * Active customers, the walk-in one among them, by name. Every sale with a
   * name can add one, so the list is read whole and not cut at 1000.
   */
  async customers(): Promise<CustomerChoice[]> {
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from('customers')
        .select('id, name, phone, walk_in')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to),
    );
    return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, walkIn: row.walk_in }));
  }

  /**
   * Sells through the database rule, all or nothing: order, delivery and
   * payment. Its refusals (what is short, a payment over the total) are
   * written for a person and travel as they are. Stock moved, so every
   * screen computes the plan again. `key` names the sale: sent again, it
   * returns the order it already made.
   */
  async sell(sale: QuickSalePayload, key: string): Promise<SoldOrder> {
    const { data, error } = await this.supabase.rpc('quick_sale', {
      p_workspace_id: await this.workspace.requireId(),
      p_lines: sale.lines,
      p_customer_id: sale.customerId ?? undefined,
      p_customer_name: sale.customerName ?? undefined,
      p_customer_phone: sale.customerPhone ?? undefined,
      p_account_id: sale.accountId ?? undefined,
      p_amount: sale.amount,
      p_payment_method: sale.method ?? undefined,
      p_sold_at: sale.soldAt ?? undefined,
      p_reference: sale.reference ?? undefined,
      p_note: sale.note ?? undefined,
      p_sale_key: key,
      p_channel_id: sale.channelId ?? undefined,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;

    this.planner.invalidate();
    return { id: data.id, number: data.number, total: Number(data.total) };
  }

  /**
   * The order a sale made, if the database saved it: the answer to «¿quedó
   * registrada?» when the connection dropped before its reply arrived.
   */
  async findSale(key: string): Promise<SoldOrder | null> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('id, number, total')
      .eq('quick_sale_key', key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    this.planner.invalidate();
    return { id: data.id, number: data.number, total: Number(data.total) };
  }

  /**
   * What a unit of each assembled product is worth on the shelf, labour
   * included: what the delivery takes it out at. The database works it out;
   * this only reads it.
   */
  private async shelfCosts(): Promise<Map<string, number>> {
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from('finished_good_costs')
        .select('variant_id, unit_cost')
        .order('inventory_item_id')
        .range(from, to),
    );
    return new Map(
      rows.flatMap((row) =>
        row.variant_id !== null && row.unit_cost !== null ? [[row.variant_id, Number(row.unit_cost)] as const] : [],
      ),
    );
  }

  /** Every variant with its name, its picture (its own, or its product's) and its list price. */
  private async variants(): Promise<VariantInfo[]> {
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from('product_variants')
        .select('id, name, list_price, image_path, catalog_products(name, image_path)')
        .order('id')
        .range(from, to),
    );

    return rows.map((row) => ({
      id: row.id,
      productName: row.catalog_products?.name ?? 'Producto',
      variantName: row.name,
      imagePath: row.image_path ?? row.catalog_products?.image_path ?? null,
      listPrice: row.list_price == null ? null : Number(row.list_price),
    }));
  }
}
