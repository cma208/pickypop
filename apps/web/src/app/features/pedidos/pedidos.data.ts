import { inject, Injectable } from '@angular/core';
import { fetchAll } from '../../core/fetch-all';
import { UserFacingError } from '../../core/friendly-error';
import { roundMoney } from '../../core/pricing';
import { SUPABASE } from '../../core/supabase';
import { partialDeliveries, type DeliveryLinePayload, type PartialDelivery } from './pedidos.delivery';
import { lineKind, type LineKind, type OrderPaymentStatus, type OrderPurpose, type OrderStatus, type PaymentMethod } from './pedidos.labels';
import { CurrentWorkspace } from '../../core/workspace';

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
  /** Its prints by state. Only a made-to-order line is printed for the order itself. */
  prints: LinePrints;
}

/** How many prints of a line are waiting, on the printer, or came out well. */
export interface LinePrints {
  planned: number;
  printing: number;
  printed: number;
}

const NO_PRINTS: LinePrints = { planned: 0, printing: 0, printed: 0 };

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
  /** "2026-10-07": a collection dated before it does not move the balance (E5-02). */
  openingBalanceOn: string;
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
    const [order, lines, progress, prints] = await Promise.all([
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
      this.supabase.from('print_jobs').select('order_line_id, status, order_lines!inner(order_id)').eq('order_lines.order_id', id),
    ]);
    if (order.error) throw order.error;
    if (lines.error) throw lines.error;
    if (progress.error) throw progress.error;
    if (prints.error) throw prints.error;
    if (!order.data) return null;

    const progressOf = new Map(progress.data.map((row) => [row.order_line_id, row]));
    const printsOf = linePrints(prints.data);

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
        prints: printsOf.get(line.id) ?? NO_PRINTS,
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
   * `key` names this delivery: sent twice (a double click, an answer the
   * browser sent again on its own) it is recorded once.
   */
  async deliver(delivery: NewDelivery, key: string): Promise<void> {
    const { error } = await this.supabase.rpc('deliver_order', {
      p_order_id: delivery.orderId,
      p_lines: delivery.lines,
      p_delivered_at: delivery.deliveredAt ?? undefined,
      p_note: delivery.note ?? undefined,
      p_delivery_key: key,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;
  }

  /**
   * Whether the delivery sent with this key was recorded: the answer to
   * «¿salió?» when the connection dropped before the reply arrived.
   */
  async deliveryRecorded(key: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('order_deliveries')
      .select('id')
      .eq('delivery_key', key)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
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
   * Collects through the database rule, which records the money and refuses an
   * overpayment or a future date. `key` names this payment: sent twice (a
   * double click, an answer that never arrived) it is recorded once (T4-01).
   * Its refusals are already worded for the person, with the exact amounts,
   * so they travel as they are instead of becoming a generic message.
   */
  async recordPayment(payment: NewPayment, key: string): Promise<void> {
    const { error } = await this.supabase.rpc('collect_order_payment', {
      p_order_id: payment.orderId,
      p_account_id: payment.accountId,
      p_amount: roundMoney(payment.amount),
      p_payment_method: payment.method ?? undefined,
      p_occurred_at: payment.occurredAt ?? undefined,
      p_reference: payment.reference ?? undefined,
      p_payment_key: key,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;
  }

  /**
   * Whether the payment sent with this key was recorded: the answer to
   * «¿quedó registrado?» when the connection dropped before the reply arrived.
   */
  async paymentRecorded(key: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('order_payment_keys')
      .select('transaction_id')
      .eq('payment_key', key)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
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

  /**
   * Cancels through the database rule, which in the same transaction cancels
   * the order's planned prints or leaves them in the queue as loose jobs,
   * whichever the person answered (E4-01). `seenPrints` are the planned
   * prints the person was shown: the answer covers those alone, and if the
   * queue holds others by now the database touches nothing and says so.
   * `cancelPrints` is null when there was nothing to ask. Its refusals (a
   * print already on the printer, money collected, a queue that changed) are
   * written for a person and travel as they are.
   */
  async cancelOrder(orderId: string, seenPrints: readonly string[], cancelPrints: boolean | null): Promise<void> {
    const { error } = await this.supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_seen_prints: [...seenPrints],
      ...(cancelPrints === null ? {} : { p_cancel_prints: cancelPrints }),
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

  /**
   * Who an order can be for. Not «Clientes varios»: it buys only in the
   * quick sale, which collects on the spot, and the database refuses an
   * order of it anywhere else (ADR-024).
   */
  async customers(): Promise<CustomerOption[]> {
    const { data, error } = await this.supabase
      .from('customers')
      .select('id, name')
      .eq('active', true)
      .eq('walk_in', false)
      .order('name');
    if (error) throw error;
    return data;
  }

  async giftCategories(): Promise<GiftCategoryOption[]> {
    const { data, error } = await this.supabase.from('gift_categories').select('id, name').order('name');
    if (error) throw error;
    return data;
  }

  /**
   * What can be sold, named "Product — variant": active variants of products
   * that are not archived. An inactive one (a workshop tool like «Molde de
   * calavera», ADR-023) is not offered, and the database refuses it too.
   */
  async variants(): Promise<VariantOption[]> {
    const [products, variants] = await Promise.all([
      this.supabase.from('catalog_products').select('id, name').neq('status', 'archived'),
      this.supabase.from('product_variants').select('id, product_id, name, list_price').eq('active', true),
    ]);
    if (products.error) throw products.error;
    if (variants.error) throw variants.error;

    const productName = new Map(products.data.map((row) => [row.id, row.name]));
    return sellableVariants(productName, variants.data);
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
   * Creates the order with its lines through the database, all or nothing:
   * the number, the header and the lines (T4-02). `key` names this order:
   * sent twice, it is created once (T4-04). Its refusals name the line and
   * the problem, so they travel as they are.
   */
  async createOrder(input: NewOrder, key: string): Promise<{ id: string; number: string }> {
    const { data, error } = await this.supabase.rpc('create_order', {
      p_workspace_id: await this.workspace.requireId(),
      p_purpose: input.purpose,
      p_lines: input.lines.map((line) => ({
        variant_id: line.variantId,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        estimated_unit_cost: line.estimatedUnitCost,
      })),
      p_customer_id: input.customerId ?? undefined,
      p_gift_category_id: input.giftCategoryId ?? undefined,
      p_recipient: input.recipient ?? undefined,
      p_due_date: input.dueDate ?? undefined,
      p_note: input.note ?? undefined,
      p_create_key: key,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;
    return { id: data.id, number: data.number };
  }
}

/** "Product — variant" for each variant whose product is still sold, in alphabetical order. */
export function sellableVariants(
  productName: ReadonlyMap<string, string>,
  variants: readonly { id: string; product_id: string; name: string; list_price: number | null }[],
): VariantOption[] {
  return variants
    .filter((variant) => productName.has(variant.product_id))
    .map((variant) => ({
      id: variant.id,
      label: `${productName.get(variant.product_id)} — ${variant.name}`,
      listPrice: variant.list_price == null ? null : Number(variant.list_price),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/** Prints by state, line by line. */
export function linePrints(rows: readonly { order_line_id: string | null; status: string }[]): Map<string, LinePrints> {
  const byLine = new Map<string, LinePrints>();
  for (const row of rows) {
    if (!row.order_line_id) continue;
    const counts = byLine.get(row.order_line_id) ?? { ...NO_PRINTS };
    if (row.status === 'planned') counts.planned++;
    else if (row.status === 'printing') counts.printing++;
    else if (row.status === 'success') counts.printed++;
    byLine.set(row.order_line_id, counts);
  }
  return byLine;
}
