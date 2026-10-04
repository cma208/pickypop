import type { Database } from '../../core/database.types';

export type PrinterState = Database['public']['Enums']['printer_status'];
export type ComponentKind = Database['public']['Enums']['component_kind'];

export interface PrinterRecord {
  id: string;
  name: string;
  model: string | null;
  status: PrinterState;
  initialHours: number;
  /** Real time of the successful print jobs, in hours. */
  workedHours: number;
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
