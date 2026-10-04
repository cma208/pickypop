import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import type {
  ChannelRecord,
  CostProfileDraft,
  CostProfileRecord,
  GiftCategoryRecord,
  GiftTreatment,
  MemberDraft,
  MemberRecord,
  WorkshopDraft,
  WorkshopRecord,
} from './configuracion.models';
import { permissionError } from '../../core/friendly-error';
import { CurrentWorkspace } from '../../core/workspace';

/**
 * Data access for the settings screen: cost profiles, workshop data, members,
 * sales channels and gift categories.
 *
 * An update that Row Level Security rejects does not raise an error, it just
 * touches zero rows, so every update asks for the row back and treats an empty
 * answer as "no permission".
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  currentRole() {
    return this.workspace.info().then((info) => info.role);
  }

  async workshop(): Promise<WorkshopRecord> {
    const id = await this.workspace.requireId();
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('id, name, currency, timezone, tax_regime, ruc, legal_name')
      .eq('id', id)
      .limit(1);
    if (error) throw error;

    const row = data[0];
    if (!row) throw permissionError();

    return {
      id: row.id,
      name: row.name,
      currency: row.currency,
      timezone: row.timezone,
      taxRegime: row.tax_regime,
      ruc: row.ruc,
      legalName: row.legal_name,
    };
  }

  async updateWorkshop(draft: WorkshopDraft): Promise<void> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .update({
        name: draft.name.trim(),
        currency: draft.currency,
        timezone: draft.timezone,
        tax_regime: draft.taxRegime,
        ruc: draft.ruc,
        legal_name: draft.legalName,
      })
      .eq('id', await this.workspace.requireId())
      .select('id');
    if (error) throw error;
    if (data.length === 0) throw permissionError();
  }

  async members(): Promise<MemberRecord[]> {
    const { data, error } = await this.supabase
      .from('workspace_members')
      .select('id, user_id, role, display_name, labor_rate_per_hour')
      .order('created_at');
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      displayName: row.display_name,
      laborRatePerHour: row.labor_rate_per_hour === null ? null : Number(row.labor_rate_per_hour),
    }));
  }

  async updateMember(memberId: string, draft: MemberDraft): Promise<void> {
    const { data, error } = await this.supabase
      .from('workspace_members')
      .update({
        display_name: draft.displayName,
        role: draft.role,
        labor_rate_per_hour: draft.laborRatePerHour,
      })
      .eq('id', memberId)
      .select('id');
    if (error) throw error;
    if (data.length === 0) throw permissionError();
  }

  /** Every version of the cost profile, newest first. */
  async costProfiles(): Promise<CostProfileRecord[]> {
    const { data, error } = await this.supabase
      .from('cost_profiles')
      .select(
        'id, valid_from, material_waste_rate, failure_rate, labor_rate_per_hour, energy_rate_per_kwh, target_margin, min_order_price, rounding_step, igv_rate, material_valuation, note',
      )
      .order('valid_from', { ascending: false });
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      validFrom: row.valid_from,
      materialWasteRate: Number(row.material_waste_rate),
      failureRate: Number(row.failure_rate),
      laborRatePerHour: Number(row.labor_rate_per_hour),
      energyRatePerKwh: Number(row.energy_rate_per_kwh),
      targetMargin: Number(row.target_margin),
      minOrderPrice: Number(row.min_order_price),
      roundingStep: Number(row.rounding_step),
      igvRate: Number(row.igv_rate),
      materialValuation: row.material_valuation,
      note: row.note,
    }));
  }

  /** Always inserts: a profile in force is never edited, only superseded. */
  async createCostProfile(draft: CostProfileDraft): Promise<void> {
    const { error } = await this.supabase.from('cost_profiles').insert({
      workspace_id: await this.workspace.requireId(),
      valid_from: draft.validFrom,
      material_waste_rate: draft.materialWasteRate,
      failure_rate: draft.failureRate,
      labor_rate_per_hour: draft.laborRatePerHour,
      energy_rate_per_kwh: draft.energyRatePerKwh,
      target_margin: draft.targetMargin,
      min_order_price: draft.minOrderPrice,
      rounding_step: draft.roundingStep,
      igv_rate: draft.igvRate,
      material_valuation: draft.materialValuation,
      note: draft.note,
    });
    if (error) throw error;
  }

  async channels(): Promise<ChannelRecord[]> {
    const { data, error } = await this.supabase
      .from('sales_channels')
      .select('id, name, commission_rate, active')
      .order('name');
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      commissionRate: Number(row.commission_rate),
      active: row.active,
    }));
  }

  async saveChannel(channelId: string | null, draft: Omit<ChannelRecord, 'id'>): Promise<void> {
    const values = {
      name: draft.name.trim(),
      commission_rate: draft.commissionRate,
      active: draft.active,
    };

    if (channelId) {
      const { data, error } = await this.supabase
        .from('sales_channels')
        .update(values)
        .eq('id', channelId)
        .select('id');
      if (error) throw error;
      if (data.length === 0) throw permissionError();
      return;
    }

    const { error } = await this.supabase
      .from('sales_channels')
      .insert({ ...values, workspace_id: await this.workspace.requireId() });
    if (error) throw error;
  }

  async giftCategories(): Promise<GiftCategoryRecord[]> {
    const { data, error } = await this.supabase
      .from('gift_categories')
      .select('id, name, treatment')
      .order('name');
    if (error) throw error;

    return data.map((row) => ({ id: row.id, name: row.name, treatment: row.treatment }));
  }

  async saveGiftCategory(
    categoryId: string | null,
    draft: { name: string; treatment: GiftTreatment },
  ): Promise<void> {
    const values = { name: draft.name.trim(), treatment: draft.treatment };

    if (categoryId) {
      const { data, error } = await this.supabase
        .from('gift_categories')
        .update(values)
        .eq('id', categoryId)
        .select('id');
      if (error) throw error;
      if (data.length === 0) throw permissionError();
      return;
    }

    const { error } = await this.supabase
      .from('gift_categories')
      .insert({ ...values, workspace_id: await this.workspace.requireId() });
    if (error) throw error;
  }
}
