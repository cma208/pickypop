import type { Database } from '../../core/database.types';

export type PrinterState = Database['public']['Enums']['printer_status'];
export type ComponentKind = Database['public']['Enums']['component_kind'];
type JobStatus = Database['public']['Enums']['print_job_status'];

export interface PrinterRecord {
  id: string;
  name: string;
  model: string | null;
  status: PrinterState;
  initialHours: number;
  /** Real time of the jobs that ran on it, failed ones included (`printedSeconds`), in hours. */
  workedHours: number;
  /** Every job recorded on this printer, whatever its outcome. Any job makes it undeletable. */
  jobCount: number;
  avgPowerW: number;
  maintenanceBudgetPerYear: number;
  expectedHoursPerYear: number;
  /** Null for a printer registered without its asset: its hourly rate is then incomplete. */
  assetId: string | null;
  assetCost: number;
  usefulLifeHours: number;
  depreciationPerHour: number;
  maintenancePerHour: number;
  machineRatePerHour: number;
}

export interface PlanRecord {
  id: string;
  printerId: string;
  task: string;
  everyHours: number | null;
  everyDays: number | null;
  checklist: string[];
  active: boolean;
  createdAt: string;
}

export interface LogRecord {
  id: string;
  printerId: string;
  planId: string | null;
  performedAt: string;
  printerHours: number;
  durationMin: number | null;
  cost: number;
  note: string | null;
  /** Checklist steps that were ticked, worded as they were that day. */
  checklistDone: string[];
}

export interface ComponentRecord {
  id: string;
  printerId: string;
  kind: ComponentKind;
  description: string | null;
  installedOn: string;
  hoursAtInstall: number;
  retiredOn: string | null;
}

export interface IncidentRecord {
  id: string;
  printerId: string;
  occurredAt: string;
  symptom: string;
  cause: string | null;
  fix: string | null;
  downtimeMin: number | null;
  cost: number;
  resolvedAt: string | null;
}

export interface PrinterWorkshop {
  printers: PrinterRecord[];
  plans: PlanRecord[];
  logs: LogRecord[];
  components: ComponentRecord[];
  incidents: IncidentRecord[];
}

/** Everything the printer form collects: the printer itself and the asset behind its hourly rate. */
export interface PrinterDraft {
  name: string;
  model: string | null;
  status: PrinterState;
  initialHours: number;
  avgPowerW: number;
  maintenanceBudgetPerYear: number;
  expectedHoursPerYear: number;
  assetCost: number;
  usefulLifeHours: number;
}

export interface PlanDraft {
  task: string;
  everyHours: number | null;
  everyDays: number | null;
  checklist: string[];
  active: boolean;
}

export interface LogDraft {
  planId: string | null;
  performedAt: string;
  printerHours: number;
  durationMin: number | null;
  cost: number;
  note: string | null;
  checklistDone: string[];
}

export interface ComponentDraft {
  kind: ComponentKind;
  description: string | null;
  installedOn: string;
  hoursAtInstall: number;
}

export interface IncidentDraft {
  occurredAt: string;
  symptom: string;
  cause: string | null;
  fix: string | null;
  downtimeMin: number | null;
  cost: number;
  /** Null while the incident is still open. */
  resolvedAt: string | null;
}

export const PRINTER_STATE_LABELS: Record<PrinterState, string> = {
  active: 'Activa',
  maintenance: 'En mantenimiento',
  retired: 'Retirada',
};

export const COMPONENT_LABELS: Record<ComponentKind, string> = {
  nozzle: 'Boquilla',
  hotend: 'Hotend',
  plate: 'Placa de impresión',
  ptfe: 'Tubo PTFE',
  cutter: 'Cuchilla del cortador',
  fan: 'Ventilador',
  ams: 'AMS',
  other: 'Otro',
};

export const COMPONENT_KINDS = Object.keys(COMPONENT_LABELS) as ComponentKind[];

export function totalHours(printer: PrinterRecord): number {
  return printer.initialHours + printer.workedHours;
}

/** What a print job tells the printer's hour meter. */
export interface JobRun {
  status: JobStatus;
  startedAt: string | null;
  actualTimeS: number | null;
}

/**
 * The seconds a job adds to the printer's hours, which the hour-based
 * maintenance plans count. A failed print wore the machine as much as a good
 * one, and its cost already charges the machine hour: counting only the
 * successful ones charged that wear and never brought the next maintenance
 * closer. A cancelled job adds what it ran; cancelled before it started, it
 * ran nothing, whatever time an older close may have saved on it.
 */
export function printedSeconds(job: JobRun): number {
  if (job.status === 'success' || job.status === 'failed') return job.actualTimeS ?? 0;
  if (job.status === 'cancelled' && job.startedAt !== null) return job.actualTimeS ?? 0;
  return 0;
}
