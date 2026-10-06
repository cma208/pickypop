import { inject, Injectable } from '@angular/core';
import { fetchAll } from '../../core/fetch-all';
import { UserFacingError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import type { Stage } from './oportunidades.models';

/** SQLSTATE de un `raise exception` de plpgsql: la base hablando a propósito. */
const RAISED_BY_DATABASE = 'P0001';

export interface OpportunityCard {
  id: string;
  title: string;
  stage: Stage;
  customerId: string | null;
  customerName: string | null;
  owner: string | null;
  ownerName: string | null;
  expectedClose: Date | null;
  note: string | null;
  blockedReason: string | null;
  blockedAt: Date | null;
  quotes: number;
  quotedTotal: number;
  orders: number;
  orderedTotal: number;
  /** Lo pedido si ya hay pedidos, y lo cotizado mientras tanto. */
  amount: number;
  openOrders: number;
  owingOrders: number;
  lastActivityAt: Date;
}

export interface StageChange {
  fromStage: Stage | null;
  toStage: Stage;
  changedAt: Date;
  changedByName: string | null;
  note: string | null;
}

export interface LinkedQuote {
  id: string;
  number: string;
  status: string;
  issuedOn: Date;
  total: number;
}

export interface LinkedOrder {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  dueDate: Date | null;
  total: number;
}

export interface OpportunityDraft {
  title: string;
  customerId: string | null;
  owner: string | null;
  expectedClose: string | null;
  note: string | null;
  blockedReason: string | null;
}

export interface CustomerOption {
  id: string;
  name: string;
}

export interface MemberOption {
  userId: string;
  name: string;
}

/** Una cotización o un pedido que todavía no pertenece a ningún trato. */
export interface LinkCandidate {
  id: string;
  number: string;
  customerName: string | null;
  total: number;
}

/**
 * Una columna `date` llega como "2026-10-04", y `new Date("2026-10-04")` la
 * lee en UTC, que en Lima es la tarde anterior. Hay que armarla local.
 */
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day);
}

/** Acceso a datos de las oportunidades. Las pantallas no hablan con Supabase. */
@Injectable({ providedIn: 'root' })
export class OportunidadesData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  async board(): Promise<OpportunityCard[]> {
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from('opportunity_board')
        // Una sola cadena literal: partida con `+` deja de ser un tipo literal
        // para TypeScript y el cliente ya no sabe qué columnas devuelve.
        .select(
          'opportunity_id, title, stage, customer_id, customer_name, owner, owner_name, expected_close, note, blocked_reason, blocked_at, quote_count, quoted_total, order_count, ordered_total, amount, open_orders, owing_orders, last_activity_at',
        )
        .order('last_activity_at', { ascending: true })
        .range(from, to),
    );

    return rows.map((row) => ({
      id: row.opportunity_id!,
      title: row.title!,
      stage: row.stage!,
      customerId: row.customer_id,
      customerName: row.customer_name,
      owner: row.owner,
      ownerName: row.owner_name,
      expectedClose: row.expected_close ? parseDateOnly(row.expected_close) : null,
      note: row.note,
      blockedReason: row.blocked_reason,
      blockedAt: row.blocked_at ? new Date(row.blocked_at) : null,
      quotes: Number(row.quote_count ?? 0),
      quotedTotal: Number(row.quoted_total ?? 0),
      orders: Number(row.order_count ?? 0),
      orderedTotal: Number(row.ordered_total ?? 0),
      amount: Number(row.amount ?? 0),
      openOrders: Number(row.open_orders ?? 0),
      owingOrders: Number(row.owing_orders ?? 0),
      lastActivityAt: new Date(row.last_activity_at!),
    }));
  }

  /**
   * Mueve la tarjeta por la función de la base, no escribiendo la columna: el
   * motivo viaja con el cambio y es el disparador quien escribe el historial.
   * Los mensajes que levanta la base ya están escritos para una persona.
   */
  async setStage(opportunityId: string, stage: Stage, reason: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('set_opportunity_stage', {
      p_opportunity: opportunityId,
      p_stage: stage,
      p_reason: reason ?? undefined,
    });
    if (error?.code === RAISED_BY_DATABASE) throw new UserFacingError(error.message);
    if (error) throw error;
  }

  async save(opportunityId: string | null, draft: OpportunityDraft): Promise<string> {
    const blocked = draft.blockedReason?.trim() || null;
    const values = {
      title: draft.title.trim(),
      customer_id: draft.customerId,
      owner: draft.owner,
      expected_close: draft.expectedClose,
      note: draft.note,
      blocked_reason: blocked,
      // La marca y su fecha van juntas o no van: la base lo exige, y así la
      // tarjeta puede decir desde cuándo está esperando.
      blocked_at: blocked ? new Date().toISOString() : null,
    };

    if (opportunityId) {
      const { error } = await this.supabase.from('opportunities').update(values).eq('id', opportunityId);
      if (error) throw error;
      return opportunityId;
    }

    const { data, error } = await this.supabase
      .from('opportunities')
      .insert({ ...values, workspace_id: await this.workspace.requireId() })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async history(opportunityId: string): Promise<StageChange[]> {
    const { data, error } = await this.supabase
      .from('opportunity_stage_history')
      .select('from_stage, to_stage, changed_at, note, changed_by')
      .eq('opportunity_id', opportunityId)
      .order('changed_at', { ascending: false });
    if (error) throw error;

    const names = await this.memberNames();
    return data.map((row) => ({
      fromStage: row.from_stage,
      toStage: row.to_stage,
      changedAt: new Date(row.changed_at),
      changedByName: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
      note: row.note,
    }));
  }

  async quotesOf(opportunityId: string): Promise<LinkedQuote[]> {
    const { data, error } = await this.supabase
      .from('quotes')
      .select('id, number, status, issued_on, total')
      .eq('opportunity_id', opportunityId)
      .order('issued_on');
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      issuedOn: parseDateOnly(row.issued_on),
      total: Number(row.total),
    }));
  }

  async ordersOf(opportunityId: string): Promise<LinkedOrder[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('id, number, status, payment_status, due_date, total')
      .eq('opportunity_id', opportunityId)
      .order('ordered_on');
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      paymentStatus: row.payment_status,
      dueDate: row.due_date ? parseDateOnly(row.due_date) : null,
      total: Number(row.total),
    }));
  }

  /** Cotizaciones todavía sueltas, para engancharlas a un trato. */
  async freeQuotes(): Promise<LinkCandidate[]> {
    const { data, error } = await this.supabase
      .from('quotes')
      .select('id, number, total, customers(name)')
      .is('opportunity_id', null)
      .order('issued_on', { ascending: false })
      .limit(50);
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      number: row.number,
      customerName: row.customers?.name ?? null,
      total: Number(row.total),
    }));
  }

  async freeOrders(): Promise<LinkCandidate[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('id, number, total, customers(name)')
      .is('opportunity_id', null)
      .order('ordered_on', { ascending: false })
      .limit(50);
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      number: row.number,
      customerName: row.customers?.name ?? null,
      total: Number(row.total),
    }));
  }

  async linkQuote(quoteId: string, opportunityId: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('quotes')
      .update({ opportunity_id: opportunityId })
      .eq('id', quoteId);
    if (error) throw error;
  }

  async linkOrder(orderId: string, opportunityId: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('orders')
      .update({ opportunity_id: opportunityId })
      .eq('id', orderId);
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

  async members(): Promise<MemberOption[]> {
    const { data, error } = await this.supabase
      .from('workspace_members')
      .select('user_id, display_name')
      .order('display_name');
    if (error) throw error;
    return data.map((row) => ({ userId: row.user_id, name: row.display_name ?? 'Sin nombre' }));
  }

  private async memberNames(): Promise<Map<string, string>> {
    return new Map((await this.members()).map((member) => [member.userId, member.name]));
  }
}
