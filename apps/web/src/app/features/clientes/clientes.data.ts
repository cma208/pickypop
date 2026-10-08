import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import { fetchAll } from '../../core/fetch-all';
import { CurrentWorkspace } from '../../core/workspace';
import type { Stage } from '../oportunidades/oportunidades.models';
import type { CustomerDraft, CustomerRecord } from './clientes.models';
import type { Database } from '../../core/database.types';

type OrderStatus = Database['public']['Enums']['order_status'];
type OrderPaymentStatus = Database['public']['Enums']['order_payment_status'];

export interface CustomerDeal {
  id: string;
  title: string;
  stage: Stage;
  expectedClose: Date | null;
  blockedReason: string | null;
}

export interface CustomerOrder {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: number;
  balance: number;
}

export interface CustomerBoughtItem {
  description: string;
  quantity: number;
  total: number;
  lastOrderedOn: Date;
}

/** Todo lo que hay que saber de un cliente para atenderlo bien. */
export interface CustomerStory {
  orders: number;
  sold: number;
  paid: number;
  balance: number;
  lastOrderOn: Date | null;
  openOpportunities: number;
  opportunities: CustomerDeal[];
  recentOrders: CustomerOrder[];
  purchases: CustomerBoughtItem[];
}

/**
 * Una columna `date` llega como "2026-10-04", y `new Date("2026-10-04")` la
 * lee en UTC, que en Lima es la tarde anterior. Hay que armarla local.
 */
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day);
}

/** Data access for customers, including how many orders each one has. */
@Injectable({ providedIn: 'root' })
export class ClientesData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  /**
   * How many orders each one has comes from `customer_history`, the same
   * count its story shows. Counted here, it took cancelled orders in: the
   * list said 2 and the story 1 for the same customer.
   */
  async list(): Promise<CustomerRecord[]> {
    const [customers, histories] = await Promise.all([
      fetchAll((from, to) =>
        this.supabase
          .from('customers')
          .select('id, kind, name, doc_type, doc_number, phone, email, note, active')
          .order('name')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        this.supabase
          .from('customer_history')
          .select('customer_id, orders')
          .order('customer_id')
          .range(from, to),
      ),
    ]);

    const counts = new Map(histories.map((row) => [row.customer_id, Number(row.orders ?? 0)]));

    return customers.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      docType: row.doc_type,
      docNumber: row.doc_number,
      phone: row.phone,
      email: row.email,
      note: row.note,
      active: row.active,
      orderCount: counts.get(row.id) ?? 0,
    }));
  }

  /**
   * Las cuentas salen de `customer_history`, que es donde la base las resuelve
   * una sola vez. Repetirlas aquí sería la cuarta pantalla con su propia
   * aritmética de centavos, que es justo lo que no se hace en este proyecto.
   */
  async story(customerId: string): Promise<CustomerStory> {
    const [summary, deals, orders, purchases] = await Promise.all([
      this.supabase
        .from('customer_history')
        .select('orders, sold, paid, balance, last_order_on, open_opportunities')
        .eq('customer_id', customerId)
        .maybeSingle(),
      this.supabase
        .from('opportunities')
        .select('id, title, stage, expected_close, blocked_reason')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('order_payment_summary')
        .select('order_id, number, status, payment_status, total, balance, ordered_on')
        .eq('customer_id', customerId)
        .order('ordered_on', { ascending: false }),
      this.supabase
        .from('customer_purchases')
        .select('description, quantity, total, last_ordered_on')
        .eq('customer_id', customerId)
        .order('total', { ascending: false }),
    ]);

    if (summary.error) throw summary.error;
    if (deals.error) throw deals.error;
    if (orders.error) throw orders.error;
    if (purchases.error) throw purchases.error;

    return {
      orders: Number(summary.data?.orders ?? 0),
      sold: Number(summary.data?.sold ?? 0),
      paid: Number(summary.data?.paid ?? 0),
      balance: Number(summary.data?.balance ?? 0),
      lastOrderOn: summary.data?.last_order_on ? parseDateOnly(summary.data.last_order_on) : null,
      openOpportunities: Number(summary.data?.open_opportunities ?? 0),
      opportunities: deals.data.map((row) => ({
        id: row.id,
        title: row.title,
        stage: row.stage,
        expectedClose: row.expected_close ? parseDateOnly(row.expected_close) : null,
        blockedReason: row.blocked_reason,
      })),
      recentOrders: orders.data.map((row) => ({
        id: row.order_id!,
        number: row.number!,
        status: row.status!,
        paymentStatus: row.payment_status!,
        total: Number(row.total),
        balance: Number(row.balance),
      })),
      purchases: purchases.data.map((row) => ({
        description: row.description!,
        quantity: Number(row.quantity),
        total: Number(row.total),
        lastOrderedOn: parseDateOnly(row.last_ordered_on!),
      })),
    };
  }

  async save(customerId: string | null, draft: CustomerDraft): Promise<void> {
    const values = {
      kind: draft.kind,
      name: draft.name.trim(),
      doc_type: draft.docType,
      doc_number: draft.docType === 'none' ? null : draft.docNumber,
      phone: draft.phone,
      email: draft.email,
      note: draft.note,
      active: draft.active,
    };

    const { error } = customerId
      ? await this.supabase.from('customers').update(values).eq('id', customerId)
      : await this.supabase
          .from('customers')
          .insert({ ...values, workspace_id: await this.workspace.requireId() });

    if (error) throw error;
  }
}
