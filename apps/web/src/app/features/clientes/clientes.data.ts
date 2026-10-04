import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import { fetchAll } from '../../core/fetch-all';
import { CurrentWorkspace } from '../../core/workspace';
import type { CustomerDraft, CustomerRecord } from './clientes.models';

/** Data access for customers, including how many orders each one has. */
@Injectable({ providedIn: 'root' })
export class ClientesData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  async list(): Promise<CustomerRecord[]> {
    const [customers, orders] = await Promise.all([
      fetchAll((from, to) =>
        this.supabase
          .from('customers')
          .select('id, kind, name, doc_type, doc_number, phone, email, note, active')
          .order('name')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        this.supabase
          .from('orders')
          .select('id, customer_id')
          .not('customer_id', 'is', null)
          .order('id')
          .range(from, to),
      ),
    ]);

    const counts = new Map<string, number>();
    for (const order of orders) {
      if (order.customer_id) counts.set(order.customer_id, (counts.get(order.customer_id) ?? 0) + 1);
    }

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
