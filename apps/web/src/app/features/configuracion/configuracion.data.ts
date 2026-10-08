import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import type {
  BrandDraft,
  BrandRecord,
  ChannelRecord,
  CostProfileDraft,
  CategoryDraft,
  CategoryRecord,
  CostProfileRecord,
  FinishDraft,
  FinishRecord,
  GiftCategoryRecord,
  GiftTreatment,
  MaterialDraft,
  MaterialRecord,
  MemberDraft,
  MemberRecord,
  PaymentCategoryChoice,
  WorkshopDraft,
  WorkshopRecord,
} from './configuracion.models';
import { permissionError, UserFacingError } from '../../core/friendly-error';
import { CurrentWorkspace } from '../../core/workspace';
import { endByToDb, timeFromDb, type ScheduleDraft, type ScheduleRecord } from './schedule.model';

/**
 * Data access for the settings screen: cost profiles, workshop data, members,
 * sales channels, gift categories, filament brands and materials.
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

  /** The printing window and the default hold, with the changeover the plan measured. */
  async schedule(): Promise<ScheduleRecord> {
    const id = await this.workspace.requireId();
    const [settings, measured] = await Promise.all([
      this.supabase
        .from('workshop_settings')
        .select('print_first_start, print_last_start, print_end_by, changeover_default_minutes, hold_default_days, hold_default_time')
        .eq('workspace_id', id)
        .maybeSingle(),
      this.supabase.from('changeover_estimate').select('samples, p75_minutes').eq('workspace_id', id).maybeSingle(),
    ]);
    if (settings.error) throw settings.error;
    if (measured.error) throw measured.error;

    const row = settings.data;
    return {
      firstStart: timeFromDb(row?.print_first_start, '06:00'),
      lastStart: timeFromDb(row?.print_last_start, '23:00'),
      endBy: timeFromDb(row?.print_end_by, '24:00'),
      changeoverMinutes: row?.changeover_default_minutes ?? 15,
      holdDays: row?.hold_default_days ?? 1,
      holdTime: timeFromDb(row?.hold_default_time, '23:00'),
      measuredMinutes: measured.data?.p75_minutes == null ? null : Number(measured.data.p75_minutes),
      samples: measured.data?.samples ?? 0,
    };
  }

  async saveSchedule(draft: ScheduleDraft): Promise<void> {
    const { error } = await this.supabase.from('workshop_settings').upsert({
      workspace_id: await this.workspace.requireId(),
      print_first_start: draft.firstStart,
      print_last_start: draft.lastStart,
      print_end_by: endByToDb(draft.endBy),
      changeover_default_minutes: draft.changeoverMinutes,
      hold_default_days: draft.holdDays,
      hold_default_time: draft.holdTime,
    });
    if (error) throw error;
  }

  async paymentCategories(): Promise<PaymentCategoryChoice> {
    const { data, error } = await this.supabase
      .from('workshop_settings')
      .select('order_payment_category_id, purchase_payment_category_id')
      .eq('workspace_id', await this.workspace.requireId())
      .maybeSingle();
    if (error) throw error;

    return {
      orderCategoryId: data?.order_payment_category_id ?? null,
      purchaseCategoryId: data?.purchase_payment_category_id ?? null,
    };
  }

  /** The database refuses a category of the wrong direction, so a stale screen cannot save one. */
  async savePaymentCategories(choice: PaymentCategoryChoice): Promise<void> {
    const { error } = await this.supabase.from('workshop_settings').upsert({
      workspace_id: await this.workspace.requireId(),
      order_payment_category_id: choice.orderCategoryId,
      purchase_payment_category_id: choice.purchaseCategoryId,
    });
    if (error) throw error;
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

  /**
   * The channel that stands for direct sales, the one the quick sale
   * preselects and the database uses when a sale names none: the owner's
   * choice while active, or else the only active channel (`default_channel`).
   */
  async defaultChannel(): Promise<string | null> {
    const { data, error } = await this.supabase.rpc('default_channel', {
      p_workspace_id: await this.workspace.requireId(),
    });
    if (error) throw error;
    return data ?? null;
  }

  /** The database refuses a channel of another workshop: the foreign key carries the workshop. */
  async saveDefaultChannel(channelId: string): Promise<void> {
    const { error } = await this.supabase.from('workshop_settings').upsert({
      workspace_id: await this.workspace.requireId(),
      default_channel_id: channelId,
    });
    if (error) throw error;
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

  async brands(): Promise<BrandRecord[]> {
    const { data, error } = await this.supabase.from('brands').select('id, name, active').order('name');
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
    }));
  }

  async saveBrand(brandId: string | null, draft: BrandDraft): Promise<void> {
    const values = { name: draft.name.trim(), active: draft.active };

    if (brandId) {
      const { data, error } = await this.supabase.from('brands').update(values).eq('id', brandId).select('id');
      if (error) throw duplicateAware(error, 'brands_workspace_id_name_key', 'Ya existe una marca con ese nombre.');
      if (data.length === 0) throw permissionError();
      return;
    }

    const { error } = await this.supabase
      .from('brands')
      .insert({ ...values, workspace_id: await this.workspace.requireId() });
    if (error) throw duplicateAware(error, 'brands_workspace_id_name_key', 'Ya existe una marca con ese nombre.');
  }

  /**
   * Las categorías con las que se clasifica el dinero. Hasta hoy solo existían
   * las de la semilla: el día que quisieran anotar un gasto de publicidad, no
   * podían, y la única entrada era la base de datos.
   */
  async categories(): Promise<CategoryRecord[]> {
    const { data, error } = await this.supabase
      .from('transaction_categories')
      .select('id, name, direction, active, sales')
      .order('direction')
      .order('name');
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      direction: row.direction,
      active: row.active,
      sales: row.sales,
    }));
  }

  /**
   * The database refuses unmarking the category collections are filed under
   * while it is chosen, with a message for a person: it travels as it is.
   */
  async saveCategory(categoryId: string | null, draft: CategoryDraft): Promise<void> {
    const duplicate = 'Ya existe una categoría con ese nombre para ese tipo.';
    const values = {
      name: draft.name.trim(),
      direction: draft.direction,
      active: draft.active,
      sales: draft.direction === 'income' && draft.sales,
    };

    if (categoryId) {
      const { data, error } = await this.supabase
        .from('transaction_categories')
        .update(values)
        .eq('id', categoryId)
        .select('id');
      if (error) throw duplicateAware(error, 'transaction_categories_workspace_id_direction_name_key', duplicate);
      if (data.length === 0) throw permissionError();
      return;
    }

    const { error } = await this.supabase
      .from('transaction_categories')
      .insert({ ...values, workspace_id: await this.workspace.requireId() });
    if (error) throw duplicateAware(error, 'transaction_categories_workspace_id_direction_name_key', duplicate);
  }

  async finishes(): Promise<FinishRecord[]> {
    const { data, error } = await this.supabase
      .from('filament_finishes')
      .select('id, name, abrasive, active')
      .order('name');
    if (error) throw error;

    return data.map((row) => ({ id: row.id, name: row.name, abrasive: row.abrasive, active: row.active }));
  }

  async saveFinish(finishId: string | null, draft: FinishDraft): Promise<void> {
    const duplicate = 'Ya existe un acabado con ese nombre.';
    const values = { name: draft.name.trim(), abrasive: draft.abrasive, active: draft.active };

    if (finishId) {
      const { data, error } = await this.supabase
        .from('filament_finishes')
        .update(values)
        .eq('id', finishId)
        .select('id');
      if (error) throw duplicateAware(error, 'filament_finishes_workspace_id_name_key', duplicate);
      if (data.length === 0) throw permissionError();
      return;
    }

    const { error } = await this.supabase
      .from('filament_finishes')
      .insert({ ...values, workspace_id: await this.workspace.requireId() });
    if (error) throw duplicateAware(error, 'filament_finishes_workspace_id_name_key', duplicate);
  }

  async materials(): Promise<MaterialRecord[]> {
    const { data, error } = await this.supabase
      .from('materials')
      .select('id, code, density_g_cm3, hygroscopic, abrasive, active')
      .order('code');
    if (error) throw error;

    return (data as MaterialRow[]).map((row) => ({
      id: row.id,
      code: row.code,
      densityGCm3: row.density_g_cm3 === null ? null : Number(row.density_g_cm3),
      hygroscopic: row.hygroscopic,
      abrasive: row.abrasive,
      active: row.active,
    }));
  }

  async saveMaterial(materialId: string | null, draft: MaterialDraft): Promise<void> {
    const values = {
      code: draft.code.trim(),
      density_g_cm3: draft.densityGCm3,
      hygroscopic: draft.hygroscopic,
      abrasive: draft.abrasive,
      active: draft.active,
    };
    const duplicate = 'Ya existe un material con ese código.';

    if (materialId) {
      const { data, error } = await this.supabase
        .from('materials')
        .update(values)
        .eq('id', materialId)
        .select('id');
      if (error) throw duplicateAware(error, 'materials_workspace_id_code_key', duplicate);
      if (data.length === 0) throw permissionError();
      return;
    }

    const { error } = await this.supabase
      .from('materials')
      .insert({ ...values, workspace_id: await this.workspace.requireId() });
    if (error) throw duplicateAware(error, 'materials_workspace_id_code_key', duplicate);
  }
}

interface MaterialRow {
  id: string;
  code: string;
  density_g_cm3: number | null;
  hygroscopic: boolean;
  abrasive: boolean;
  active: boolean;
}

/** A unique violation on `constraint` becomes a sentence; anything else passes through. */
function duplicateAware(error: { message?: string }, constraint: string, message: string): unknown {
  return error.message?.includes(constraint) ? new UserFacingError(message) : error;
}
