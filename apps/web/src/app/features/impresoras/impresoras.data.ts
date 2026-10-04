import { inject, Injectable } from '@angular/core';
import type { Json } from '../../core/database.types';
import { SUPABASE } from '../../core/supabase';
import { fetchAll } from '../../core/fetch-all';
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
  PrinterRecord,
  PrinterWorkshop,
} from './impresoras.models';

const SECONDS_PER_HOUR = 3600;

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
    const [printers, rates, workedByPrinter, plans, logs, components, incidents] = await Promise.all([
      this.supabase
        .from('printers')
        .select('id, name, model, status, initial_hours')
        .order('name'),
      this.supabase
        .from('printer_machine_rates')
        .select('printer_id, depreciation_per_hour, maintenance_per_hour, machine_rate_per_hour'),
      this.workedSecondsByPrinter(),
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
        return {
          id: row.id,
          name: row.name,
          model: row.model,
          status: row.status,
          initialHours: Number(row.initial_hours),
          workedHours: (workedByPrinter.get(row.id) ?? 0) / SECONDS_PER_HOUR,
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

  /** Real print time of successful jobs, in seconds, grouped by printer. */
  private async workedSecondsByPrinter(): Promise<Map<string, number>> {
    const jobs = await fetchAll((from, to) =>
      this.supabase
        .from('print_jobs')
        .select('id, printer_id, actual_time_s')
        .eq('status', 'success')
        .order('id')
        .range(from, to),
    );

    const totals = new Map<string, number>();
    for (const job of jobs) {
      totals.set(job.printer_id, (totals.get(job.printer_id) ?? 0) + (job.actual_time_s ?? 0));
    }
    return totals;
  }
}
