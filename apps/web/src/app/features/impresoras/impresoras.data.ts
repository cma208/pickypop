import { inject, Injectable } from '@angular/core';
import type { Json } from '../../core/database.types';
import { SUPABASE } from '../../core/supabase';
import { fetchAll } from '../../core/fetch-all';
import { permissionError, UserFacingError } from '../../core/friendly-error';
import { CurrentWorkspace } from '../../core/workspace';
import type {
  ComponentDraft,
  ComponentRecord,
  IncidentDraft,
  IncidentRecord,
  LogDraft,
  LogRecord,
  PlanDraft,
  PlanRecord,
  PrinterDraft,
  PrinterRecord,
  PrinterState,
  PrinterWorkshop,
} from './impresoras.models';

const SECONDS_PER_HOUR = 3600;
const PRINTER_NAME_KEY = 'printers_workspace_id_name_key';
const FOREIGN_KEY_VIOLATION = '23503';

interface JobStats {
  /** Real time of the successful jobs. */
  seconds: number;
  /** Jobs of any outcome. */
  count: number;
}

/** The column is jsonb, so anything can be in there: keep only strings, else nothing. */
export function parseChecklist(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Data access for printers, maintenance, components and incidents. */
@Injectable({ providedIn: 'root' })
export class ImpresorasData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  async load(): Promise<PrinterWorkshop> {
    const [printers, rates, jobsByPrinter, plans, logs, components, incidents] = await Promise.all([
      this.supabase
        .from('printers')
        .select(
          'id, name, model, status, initial_hours, avg_power_w, maintenance_budget_per_year, expected_hours_per_year, asset_id, assets(cost, useful_life_hours)',
        )
        .order('name'),
      this.supabase
        .from('printer_machine_rates')
        .select('printer_id, depreciation_per_hour, maintenance_per_hour, machine_rate_per_hour'),
      this.jobStatsByPrinter(),
      this.supabase
        .from('maintenance_plans')
        .select('id, printer_id, task, every_hours, every_days, checklist, active, created_at')
        .order('created_at'),
      fetchAll((from, to) =>
        this.supabase
          .from('maintenance_logs')
          .select('id, printer_id, plan_id, performed_at, printer_hours_at, duration_min, cost, note, checklist_done')
          .order('performed_at', { ascending: false })
          .range(from, to),
      ),
      this.supabase
        .from('printer_components')
        .select('id, printer_id, kind, description, installed_on, hours_at_install, retired_on')
        .order('installed_on', { ascending: false }),
      this.supabase
        .from('incidents')
        .select('id, printer_id, occurred_at, symptom, cause, fix, downtime_min, cost, resolved_at')
        .order('occurred_at', { ascending: false }),
    ]);

    for (const result of [printers, rates, plans, components, incidents]) {
      if (result.error) throw result.error;
    }

    const rateByPrinter = new Map((rates.data ?? []).map((row) => [row.printer_id, row]));

    return {
      printers: (printers.data ?? []).map((row): PrinterRecord => {
        const rate = rateByPrinter.get(row.id);
        const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
        const jobs = jobsByPrinter.get(row.id);
        return {
          id: row.id,
          name: row.name,
          model: row.model,
          status: row.status,
          initialHours: Number(row.initial_hours),
          workedHours: (jobs?.seconds ?? 0) / SECONDS_PER_HOUR,
          jobCount: jobs?.count ?? 0,
          avgPowerW: Number(row.avg_power_w),
          maintenanceBudgetPerYear: Number(row.maintenance_budget_per_year),
          expectedHoursPerYear: Number(row.expected_hours_per_year),
          assetId: row.asset_id,
          assetCost: Number(asset?.cost ?? 0),
          usefulLifeHours: Number(asset?.useful_life_hours ?? 0),
          depreciationPerHour: Number(rate?.depreciation_per_hour ?? 0),
          maintenancePerHour: Number(rate?.maintenance_per_hour ?? 0),
          machineRatePerHour: Number(rate?.machine_rate_per_hour ?? 0),
        };
      }),
      plans: (plans.data ?? []).map((row): PlanRecord => ({
        id: row.id,
        printerId: row.printer_id,
        task: row.task,
        everyHours: row.every_hours === null ? null : Number(row.every_hours),
        everyDays: row.every_days,
        checklist: parseChecklist(row.checklist),
        active: row.active,
        createdAt: row.created_at,
      })),
      logs: logs.map((row): LogRecord => ({
        id: row.id,
        printerId: row.printer_id,
        planId: row.plan_id,
        performedAt: row.performed_at,
        printerHours: Number(row.printer_hours_at),
        durationMin: row.duration_min,
        cost: Number(row.cost),
        note: row.note,
        checklistDone: parseChecklist(row.checklist_done),
      })),
      components: (components.data ?? []).map((row): ComponentRecord => ({
        id: row.id,
        printerId: row.printer_id,
        kind: row.kind,
        description: row.description,
        installedOn: row.installed_on,
        hoursAtInstall: Number(row.hours_at_install),
        retiredOn: row.retired_on,
      })),
      incidents: (incidents.data ?? []).map((row): IncidentRecord => ({
        id: row.id,
        printerId: row.printer_id,
        occurredAt: row.occurred_at,
        symptom: row.symptom,
        cause: row.cause,
        fix: row.fix,
        downtimeMin: row.downtime_min,
        cost: Number(row.cost),
        resolvedAt: row.resolved_at,
      })),
    };
  }

  /**
   * Creates or updates a printer together with the asset its hourly rate is
   * computed from, and returns the printer id.
   *
   * The two inserts cannot share a transaction from the browser, so the asset
   * goes first and is removed again if the printer then fails: otherwise a
   * failed save would leave an orphan asset behind. The name is checked up
   * front because that is by far the likeliest reason for the second insert to
   * fail, and an ordinary member is not allowed to delete the asset afterwards.
   */
  async savePrinter(
    printer: Pick<PrinterRecord, 'id' | 'assetId'> | null,
    draft: PrinterDraft,
  ): Promise<string> {
    const name = draft.name.trim();
    await this.assertNameFree(name, printer?.id ?? null);

    const workspaceId = await this.workspace.requireId();
    const assetValues = { cost: draft.assetCost, useful_life_hours: draft.usefulLifeHours };
    const printerValues = {
      name,
      model: draft.model,
      status: draft.status,
      initial_hours: draft.initialHours,
      avg_power_w: draft.avgPowerW,
      maintenance_budget_per_year: draft.maintenanceBudgetPerYear,
      expected_hours_per_year: draft.expectedHoursPerYear,
    };

    if (printer?.assetId) {
      const { data, error } = await this.supabase
        .from('assets')
        .update(assetValues)
        .eq('id', printer.assetId)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw permissionError();
    }

    const assetId = printer?.assetId ?? (await this.insertAsset(workspaceId, name, assetValues));

    try {
      if (printer) {
        const { data, error } = await this.supabase
          .from('printers')
          .update({ ...printerValues, asset_id: assetId })
          .eq('id', printer.id)
          .select('id');
        if (error) throw translatePrinterError(error);
        if (!data?.length) throw permissionError();
        return printer.id;
      }

      const { data, error } = await this.supabase
        .from('printers')
        .insert({ ...printerValues, asset_id: assetId, workspace_id: workspaceId })
        .select('id')
        .single();
      if (error) throw translatePrinterError(error);
      return data.id;
    } catch (failure) {
      if (!printer?.assetId) await this.supabase.from('assets').delete().eq('id', assetId);
      throw failure;
    }
  }

  async setPrinterStatus(printerId: string, status: PrinterState): Promise<void> {
    const { data, error } = await this.supabase
      .from('printers')
      .update({ status })
      .eq('id', printerId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw permissionError();
  }

  /**
   * Only for a printer that never printed anything (a registration mistake):
   * one with jobs is retired instead, so its history keeps a machine to point
   * at. Its maintenance plans, parts and incidents go with it. Deleting is
   * limited to owners by the database, which answers a refused delete with
   * zero rows rather than an error.
   */
  async deletePrinter(printer: Pick<PrinterRecord, 'id' | 'assetId'>): Promise<void> {
    const { data, error } = await this.supabase.from('printers').delete().eq('id', printer.id).select('id');
    if (error) throw translatePrinterError(error);
    if (!data?.length) throw permissionError();

    if (printer.assetId) await this.deleteAssetIfUnused(printer.assetId);
  }

  private async insertAsset(
    workspaceId: string,
    printerName: string,
    values: { cost: number; useful_life_hours: number },
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('assets')
      .insert({ ...values, name: `Impresora ${printerName}`, workspace_id: workspaceId })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  private async deleteAssetIfUnused(assetId: string): Promise<void> {
    const { count, error } = await this.supabase
      .from('printers')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', assetId);
    if (error || count) return;
    await this.supabase.from('assets').delete().eq('id', assetId);
  }

  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    let query = this.supabase.from('printers').select('id', { count: 'exact', head: true }).eq('name', name);
    if (exceptId) query = query.neq('id', exceptId);

    const { count, error } = await query;
    if (error) throw error;
    if (count) throw new UserFacingError('Ya hay una impresora con ese nombre. Usa otro para distinguirlas.');
  }

  async savePlan(printerId: string, planId: string | null, draft: PlanDraft): Promise<void> {
    const values = {
      task: draft.task.trim(),
      every_hours: draft.everyHours,
      every_days: draft.everyDays,
      checklist: draft.checklist,
      active: draft.active,
    };

    const { error } = planId
      ? await this.supabase.from('maintenance_plans').update(values).eq('id', planId)
      : await this.supabase
          .from('maintenance_plans')
          .insert({ ...values, printer_id: printerId, workspace_id: await this.workspace.requireId() });

    if (error) throw error;
  }

  async setPlanActive(planId: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('maintenance_plans').update({ active }).eq('id', planId);
    if (error) throw error;
  }

  async logMaintenance(printerId: string, draft: LogDraft): Promise<void> {
    const { error } = await this.supabase.from('maintenance_logs').insert({
      workspace_id: await this.workspace.requireId(),
      printer_id: printerId,
      plan_id: draft.planId,
      performed_at: draft.performedAt,
      printer_hours_at: draft.printerHours,
      duration_min: draft.durationMin,
      cost: draft.cost,
      note: draft.note,
      checklist_done: draft.checklistDone,
    });
    if (error) throw error;
  }

  async addComponent(printerId: string, draft: ComponentDraft): Promise<void> {
    const { error } = await this.supabase.from('printer_components').insert({
      workspace_id: await this.workspace.requireId(),
      printer_id: printerId,
      kind: draft.kind,
      description: draft.description,
      installed_on: draft.installedOn,
      hours_at_install: draft.hoursAtInstall,
    });
    if (error) throw error;
  }

  async retireComponent(componentId: string, retiredOn: string): Promise<void> {
    const { error } = await this.supabase
      .from('printer_components')
      .update({ retired_on: retiredOn })
      .eq('id', componentId);
    if (error) throw error;
  }

  async saveIncident(printerId: string, incidentId: string | null, draft: IncidentDraft): Promise<void> {
    const values = {
      occurred_at: draft.occurredAt,
      symptom: draft.symptom.trim(),
      cause: draft.cause,
      fix: draft.fix,
      downtime_min: draft.downtimeMin,
      cost: draft.cost,
      resolved_at: draft.resolvedAt,
    };

    const { error } = incidentId
      ? await this.supabase.from('incidents').update(values).eq('id', incidentId)
      : await this.supabase
          .from('incidents')
          .insert({ ...values, printer_id: printerId, workspace_id: await this.workspace.requireId() });

    if (error) throw error;
  }

  /** Hours come from successful jobs only, but any job at all blocks deleting the printer. */
  private async jobStatsByPrinter(): Promise<Map<string, JobStats>> {
    const jobs = await fetchAll((from, to) =>
      this.supabase
        .from('print_jobs')
        .select('id, printer_id, status, actual_time_s')
        .order('id')
        .range(from, to),
    );

    const stats = new Map<string, JobStats>();
    for (const job of jobs) {
      const current = stats.get(job.printer_id) ?? { seconds: 0, count: 0 };
      current.count += 1;
      if (job.status === 'success') current.seconds += job.actual_time_s ?? 0;
      stats.set(job.printer_id, current);
    }
    return stats;
  }
}

function translatePrinterError(error: { code?: string; message?: string }): unknown {
  if (error.message?.includes(PRINTER_NAME_KEY)) {
    return new UserFacingError('Ya hay una impresora con ese nombre. Usa otro para distinguirlas.');
  }
  if (error.code === FOREIGN_KEY_VIOLATION) {
    return new UserFacingError(
      'Esta impresora tiene impresiones registradas y no se puede borrar. Dala de baja para dejar de usarla.',
    );
  }
  return error;
}
