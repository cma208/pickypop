import { inject, Injectable } from '@angular/core';
import { fetchAll } from '../../core/fetch-all';
import { UserFacingError } from '../../core/friendly-error';
import { PlanService } from '../../core/plan';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { shelfOffers, type CustomerChoice, type QuickSalePayload, type ShelfOffer, type VariantInfo } from './quick-sale';

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
    const [view, variants] = await Promise.all([this.planner.current(), this.variants()]);
    return shelfOffers(view, variants);
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
   * screen computes the plan again.
   */
  async sell(sale: QuickSalePayload): Promise<SoldOrder> {
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
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;

    this.planner.invalidate();
    return { id: data.id, number: data.number, total: Number(data.total) };
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
