import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import { Workshop } from '../../core/workshop';
import type { OrderPurpose, OrderStatus } from './pedidos.labels';
import { WorkspaceScope } from './workspace-scope';

const DOCUMENT_KIND_ORDER = 'order';
const CENTS = 100;

export interface OrderListItem {
  id: string;
  number: string;
  purpose: OrderPurpose;
  status: OrderStatus;
  orderedOn: Date;
  dueDate: Date | null;
  total: number;
  recipient: string | null;
  customerName: string | null;
  giftCategoryName: string | null;
}

export interface OrderLine {
  id: string;
  position: number;
  variantId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  estimatedUnitCost: number;
  lineTotal: number;
}

export interface OrderDetail extends OrderListItem {
  note: string | null;
  lines: OrderLine[];
}

export interface OrderSummary {
  jobs: number;
  successfulJobs: number;
  failedJobs: number;
  printedHours: number;
  realProductionCost: number;
  estimatedCost: number;
  soldFor: number;
}

export interface CustomerOption {
  id: string;
  name: string;
}

export interface GiftCategoryOption {
  id: string;
  name: string;
}

export interface VariantOption {
  id: string;
  label: string;
  listPrice: number | null;
}

export interface NewOrderLine {
  variantId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  estimatedUnitCost: number;
}

export interface NewOrder {
  purpose: OrderPurpose;
  customerId: string | null;
  giftCategoryId: string | null;
  recipient: string | null;
  dueDate: string | null;
  note: string | null;
  lines: NewOrderLine[];
}

/**
 * A `date` column comes as "2026-10-04". `new Date("2026-10-04")` reads it as
 * UTC midnight, which is the previous evening in Lima, so build it locally.
 */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day);
}

export function roundMoney(value: number): number {
  return Math.round(value * CENTS) / CENTS;
}

/** Data access for orders. Pages never talk to Supabase directly. */
@Injectable({ providedIn: 'root' })
export class PedidosData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(WorkspaceScope);
  private readonly workshop = inject(Workshop);

  async listOrders(): Promise<OrderListItem[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select(
        'id, number, purpose, status, ordered_on, due_date, total, recipient, customers(name), gift_categories(name)',
      )
      .order('created_at', { ascending: false });
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      number: row.number,
      purpose: row.purpose,
      status: row.status,
      orderedOn: parseDateOnly(row.ordered_on),
      dueDate: row.due_date ? parseDateOnly(row.due_date) : null,
      total: Number(row.total),
      recipient: row.recipient,
      customerName: row.customers?.name ?? null,
      giftCategoryName: row.gift_categories?.name ?? null,
    }));
  }

  async getOrder(id: string): Promise<OrderDetail | null> {
    const [order, lines] = await Promise.all([
      this.supabase
        .from('orders')
        .select(
          'id, number, purpose, status, ordered_on, due_date, total, recipient, note, customers(name), gift_categories(name)',
        )
        .eq('id', id)
        .maybeSingle(),
      this.supabase
        .from('order_lines')
        .select('id, position, variant_id, description, quantity, unit_price, estimated_unit_cost, line_total')
        .eq('order_id', id)
        .order('position'),
    ]);
    if (order.error) throw order.error;
    if (lines.error) throw lines.error;
    if (!order.data) return null;

    const row = order.data;
    return {
      id: row.id,
      number: row.number,
      purpose: row.purpose,
      status: row.status,
      orderedOn: parseDateOnly(row.ordered_on),
      dueDate: row.due_date ? parseDateOnly(row.due_date) : null,
      total: Number(row.total),
      recipient: row.recipient,
      note: row.note,
      customerName: row.customers?.name ?? null,
      giftCategoryName: row.gift_categories?.name ?? null,
      lines: lines.data.map((line) => ({
        id: line.id,
        position: line.position,
        variantId: line.variant_id,
        description: line.description,
        quantity: line.quantity,
        unitPrice: Number(line.unit_price),
        estimatedUnitCost: Number(line.estimated_unit_cost),
        lineTotal: Number(line.line_total),
      })),
    };
  }

  /** Estimated against real, as computed by the database. */
  async summary(orderId: string): Promise<OrderSummary | null> {
    const { data, error } = await this.supabase
      .from('order_production_summary')
      .select(
        'jobs, successful_jobs, failed_jobs, printed_hours, real_production_cost, estimated_cost, sold_for',
      )
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
      jobs: Number(data.jobs),
      successfulJobs: Number(data.successful_jobs),
      failedJobs: Number(data.failed_jobs),
      printedHours: Number(data.printed_hours),
      realProductionCost: Number(data.real_production_cost),
      estimatedCost: Number(data.estimated_cost),
      soldFor: Number(data.sold_for),
    };
  }

  async setStatus(orderId: string, status: OrderStatus): Promise<void> {
    const { error } = await this.supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) throw error;
  }

  async customers(): Promise<CustomerOption[]> {
    const { data, error } = await this.supabase
      .from('customers')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return data;
  }

  async createCustomer(name: string, phone: string | null): Promise<CustomerOption> {
    const { data, error } = await this.supabase
      .from('customers')
      .insert({ workspace_id: await this.workspace.id(), name: name.trim(), phone })
      .select('id, name')
      .single();
    if (error) throw error;
    return data;
  }

  async giftCategories(): Promise<GiftCategoryOption[]> {
    const { data, error } = await this.supabase.from('gift_categories').select('id, name').order('name');
    if (error) throw error;
    return data;
  }

  /** Sellable variants, named "Product — variant". Archived products are left out. */
  async variants(): Promise<VariantOption[]> {
    const products = await this.workshop.catalog();

    return products
      .filter((product) => product.status !== 'archived')
      .flatMap((product) =>
        product.variants.map((variant) => ({
          id: variant.id,
          label: `${product.name} — ${variant.name}`,
          listPrice: variant.listPrice,
        })),
      )
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  /** The price the tier ladder gives for this quantity, through the database rule. */
  async suggestedPrice(variantId: string, quantity: number): Promise<number | null> {
    const { data, error } = await this.supabase.rpc('price_for_quantity', {
      p_variant: variantId,
      p_quantity: quantity,
    });
    if (error) throw error;
    return data == null ? null : Number(data);
  }

  /**
   * Creates the order with its lines. There is no multi-table transaction from
   * the browser, so if the lines fail the empty order is removed again.
   */
  async createOrder(input: NewOrder): Promise<{ id: string; number: string }> {
    const workspaceId = await this.workspace.id();
    const isSale = input.purpose === 'sale';

    const { data: number, error: numberError } = await this.supabase.rpc('next_document_number', {
      p_workspace: workspaceId,
      p_doc_kind: DOCUMENT_KIND_ORDER,
    });
    if (numberError) throw numberError;

    const total = isSale
      ? roundMoney(input.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))
      : 0;

    const { data: order, error } = await this.supabase
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        number,
        purpose: input.purpose,
        customer_id: isSale ? input.customerId : null,
        gift_category_id: input.purpose === 'gift' ? input.giftCategoryId : null,
        recipient: input.recipient,
        due_date: input.dueDate,
        note: input.note,
        total,
      })
      .select('id, number')
      .single();
    if (error) throw error;

    const { error: linesError } = await this.supabase.from('order_lines').insert(
      input.lines.map((line, index) => ({
        workspace_id: workspaceId,
        order_id: order.id,
        position: index + 1,
        variant_id: line.variantId,
        description: line.description,
        quantity: line.quantity,
        unit_price: isSale ? line.unitPrice : 0,
        estimated_unit_cost: line.estimatedUnitCost,
      })),
    );

    if (linesError) {
      await this.supabase.from('orders').delete().eq('id', order.id);
      throw linesError;
    }
    return order;
  }
}
