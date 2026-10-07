import { inject, Injectable } from '@angular/core';
import { todayLocal } from '../../core/dates';
import { fetchAll } from '../../core/fetch-all';
import { UserFacingError } from '../../core/friendly-error';
import { roundMoney } from '../../core/pricing';
import { SUPABASE } from '../../core/supabase';
import { Workshop } from '../../core/workshop';
import { partialDeliveries, type DeliveryLinePayload, type PartialDelivery } from './pedidos.delivery';
import { lineKind, type LineKind, type OrderPaymentStatus, type OrderPurpose, type OrderStatus, type PaymentMethod } from './pedidos.labels';
import { CurrentWorkspace } from '../../core/workspace';

const DOCUMENT_KIND_ORDER = 'order';
/** SQLSTATE of a `raise exception` in plpgsql: the database speaking on purpose. */
const RAISED_BY_DATABASE = 'P0001';

export interface OrderListItem {
  id: string;
  number: string;
  purpose: OrderPurpose;
  status: OrderStatus;
  /** Derived by the database from the money movements; `not_applicable` for anything but a sale. */
  paymentStatus: OrderPaymentStatus;
  orderedOn: Date;
  dueDate: Date | null;
  total: number;
  recipient: string | null;
  customerName: string | null;
  giftCategoryName: string | null;
  /** Set only while part of the order is out and part is still pending. */
  partialDelivery: PartialDelivery | null;
}

export interface OrderLine {
  id: string;
  position: number;
  variantId: string | null;
  /** Catalogue, made to order or a service: it decides how the line gets made. */
  kind: LineKind;
  description: string;
  /** The variant's photo, or the product's when the variant has none. */
  imagePath: string | null;
  quantity: number;
  unitPrice: number;
  estimatedUnitCost: number;
  lineTotal: number;
  /** Already out, according to the recorded deliveries. */
  delivered: number;
  /** Still to deliver. Zero on a cancelled order: nothing more goes out. */
  pending: number;
}

/** One time something of the order left the workshop. */
export interface OrderDelivery {
  id: string;
  deliveredAt: Date;
  note: string | null;
  lines: { orderLineId: string; quantity: number }[];
}

export interface NewDelivery {
  orderId: string;
  lines: DeliveryLinePayload[];
  /** ISO instant, or null for "now". */
  deliveredAt: string | null;
  note: string | null;
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
  /** Units that left the shelf, and what they cost at the shelf's average (ADR-022). */
  deliveredUnits: number;
  deliveredCost: number;
}

/** What a sale is worth, what was collected on it and what is still owed. */
export interface PaymentSummary {
  total: number;
  paid: number;
  balance: number;
  paymentStatus: OrderPaymentStatus;
  lastPaymentAt: Date | null;
}

export interface AccountOption {
  id: string;
  name: string;
  /** What the collection form fills in when the person leaves the method blank. */
  defaultMethod: PaymentMethod | null;
}

export interface NewPayment {
  orderId: string;
  accountId: string;
  amount: number;
  /** Null lets the database use the account's default method. */
  method: PaymentMethod | null;
  /** ISO instant, or null for "now". */
  occurredAt: string | null;
  reference: string | null;
}

export interface StatusChange {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedAt: Date;
  changedByName: string | null;
  note: string | null;
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
  /** Null for a piece made to order: it has no variant and takes nothing off the shelf. */
  variantId: string | null;
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

/** Data access for orders. Pages never talk to Supabase directly. */
@Injectable({ providedIn: 'root' })
export class PedidosData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly workshop = inject(Workshop);

  async listOrders(): Promise<OrderListItem[]> {
    const [{ data, error }, deliveryRows] = await Promise.all([
      this.supabase
        .from('orders')
        .select(
          'id, number, purpose, status, payment_status, ordered_on, due_date, total, recipient, customers(name), gift_categories(name)',
        )
        .order('created_at', { ascending: false }),
      fetchAll((from, to) =>
        this.supabase
          .from('order_line_delivery_status')
          .select('order_line_id, order_id, quantity, delivered, pending')
          .order('order_line_id')
          .range(from, to),
      ),
    ]);
    if (error) throw error;

    const partial = partialDeliveries(
      deliveryRows.map((row) => ({
        orderId: row.order_id ?? '',
        quantity: Number(row.quantity ?? 0),
        delivered: Number(row.delivered ?? 0),
        pending: Number(row.pending ?? 0),
      })),
    );

    return data.map((row) => ({
      id: row.id,
      number: row.number,
      purpose: row.purpose,
      status: row.status,
      paymentStatus: row.payment_status,
      orderedOn: parseDateOnly(row.ordered_on),
      dueDate: row.due_date ? parseDateOnly(row.due_date) : null,
      total: Number(row.total),
      recipient: row.recipient,
      customerName: row.customers?.name ?? null,
      giftCategoryName: row.gift_categories?.name ?? null,
      partialDelivery: partial.get(row.id) ?? null,
    }));
  }

  async getOrder(id: string): Promise<OrderDetail | null> {
    const [order, lines, progress] = await Promise.all([
      this.supabase
        .from('orders')
        .select(
          'id, number, purpose, status, payment_status, ordered_on, due_date, total, recipient, note, customers(name), gift_categories(name)',
        )
        .eq('id', id)
        .maybeSingle(),
      this.supabase
        .from('order_lines')
        .select('id, position, variant_id, description, quantity, unit_price, estimated_unit_cost, line_total, product_variants(image_path, catalog_products(image_path)), quote_lines(kind)')
        .eq('order_id', id)
        .order('position'),
      this.supabase.from('order_line_delivery_status').select('order_line_id, delivered, pending').eq('order_id', id),
    ]);
    if (order.error) throw order.error;
    if (lines.error) throw lines.error;
    if (progress.error) throw progress.error;
    if (!order.data) return null;

    const progressOf = new Map(progress.data.map((row) => [row.order_line_id, row]));

    const row = order.data;
    return {
      id: row.id,
      number: row.number,
      purpose: row.purpose,
      status: row.status,
      paymentStatus: row.payment_status,
      orderedOn: parseDateOnly(row.ordered_on),
      dueDate: row.due_date ? parseDateOnly(row.due_date) : null,
      total: Number(row.total),
      recipient: row.recipient,
      note: row.note,
      customerName: row.customers?.name ?? null,
      giftCategoryName: row.gift_categories?.name ?? null,
      partialDelivery: null,
      lines: lines.data.map((line) => ({
        id: line.id,
        position: line.position,
        variantId: line.variant_id,
        kind: lineKind(line.variant_id, line.quote_lines?.kind ?? null),
        description: line.description,
        imagePath: line.product_variants?.image_path ?? line.product_variants?.catalog_products?.image_path ?? null,
        quantity: line.quantity,
        unitPrice: Number(line.unit_price),
        estimatedUnitCost: Number(line.estimated_unit_cost),
        lineTotal: Number(line.line_total),
        delivered: Number(progressOf.get(line.id)?.delivered ?? 0),
        // A line the view does not know about is not offered: the database
        // would have nothing to take off the shelf for it.
        pending: Number(progressOf.get(line.id)?.pending ?? 0),
      })),
    };
  }

  /** What has already left, most recent first. */
  async deliveries(orderId: string): Promise<OrderDelivery[]> {
    const { data, error } = await this.supabase
      .from('order_deliveries')
      .select('id, delivered_at, note, order_delivery_lines(order_line_id, quantity)')
      .eq('order_id', orderId)
      .order('delivered_at', { ascending: false });
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      deliveredAt: new Date(row.delivered_at),
      note: row.note,
      lines: row.order_delivery_lines.map((line) => ({ orderLineId: line.order_line_id, quantity: line.quantity })),
    }));
  }

  /**
   * Delivers through the database rule, which takes the things off the shelf,
   * records their cost and marks the order delivered once nothing is left. Its
   * refusals say what is missing and how much, so they travel as they are.
   */
  async deliver(delivery: NewDelivery): Promise<void> {
    const { error } = await this.supabase.rpc('deliver_order', {
      p_order_id: delivery.orderId,
      p_lines: delivery.lines,
      p_delivered_at: delivery.deliveredAt ?? undefined,
      p_note: delivery.note ?? undefined,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;
  }

  /** Estimated against real, as computed by the database. */
  async summary(orderId: string): Promise<OrderSummary | null> {
    const { data, error } = await this.supabase
      .from('order_production_summary')
      .select(
        'jobs, successful_jobs, failed_jobs, printed_hours, real_production_cost, estimated_cost, sold_for, delivered_units, delivered_cost',
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
      deliveredUnits: Number(data.delivered_units ?? 0),
      deliveredCost: Number(data.delivered_cost ?? 0),
    };
  }

  /** Null when the order is not a sale: the view only lists those. */
  async paymentSummary(orderId: string): Promise<PaymentSummary | null> {
    const { data, error } = await this.supabase
      .from('order_payment_summary')
      .select('total, paid, balance, payment_status, last_payment_at')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
      total: Number(data.total),
      paid: Number(data.paid),
      balance: Number(data.balance),
      paymentStatus: data.payment_status ?? 'unpaid',
      lastPaymentAt: data.last_payment_at ? new Date(data.last_payment_at) : null,
    };
  }

  /** Accounts that can receive money today. */
  async paymentAccounts(): Promise<AccountOption[]> {
    const { data, error } = await this.supabase
      .from('accounts')
      .select('id, name, default_payment_method')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return data.map((row) => ({ id: row.id, name: row.name, defaultMethod: row.default_payment_method }));
  }

  /**
   * Collects through the database rule, which records the money and refuses an
   * overpayment. Its refusals are already worded for the person, with the exact
   * amounts, so they travel as they are instead of becoming a generic message.
   */
  async recordPayment(payment: NewPayment): Promise<void> {
    const { error } = await this.supabase.rpc('record_payment', {
      p_order_id: payment.orderId,
      p_account_id: payment.accountId,
      p_amount: roundMoney(payment.amount),
      p_payment_method: payment.method ?? undefined,
      p_occurred_at: payment.occurredAt ?? undefined,
      p_reference: payment.reference ?? undefined,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;
  }

  /**
   * Cambia el estado por la función de la base y no escribiendo la columna: el
   * motivo viaja con el cambio, y es un disparador —no esta pantalla— quien
   * escribe el historial. La base rechaza un retroceso sin motivo con un
   * mensaje ya escrito para una persona, así que viaja tal cual.
   */
  async setStatus(orderId: string, status: OrderStatus, reason: string | null = null): Promise<void> {
    const { error } = await this.supabase.rpc('set_order_status', {
      p_order_id: orderId,
      p_status: status,
      p_reason: reason?.trim() || undefined,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;
  }

  /** Por dónde ha pasado el pedido, lo más reciente primero. */
  async statusHistory(orderId: string): Promise<StatusChange[]> {
    const [history, members] = await Promise.all([
      this.supabase
        .from('order_status_history')
        .select('from_status, to_status, changed_at, changed_by, note')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false }),
      this.supabase.from('workspace_members').select('user_id, display_name'),
    ]);
    if (history.error) throw history.error;
    if (members.error) throw members.error;

    const names = new Map(members.data.map((row) => [row.user_id, row.display_name ?? 'Sin nombre']));
    return history.data.map((row) => ({
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedAt: new Date(row.changed_at),
      changedByName: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
      note: row.note,
    }));
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
      .insert({ workspace_id: await this.workspace.requireId(), name: name.trim(), phone })
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
    const workspaceId = await this.workspace.requireId();
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
        // The column defaults to the UTC day, which after 19:00 in Lima is
        // already tomorrow. An accepted quote dates its order the same way.
        ordered_on: todayLocal(),
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
