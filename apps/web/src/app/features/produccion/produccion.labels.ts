import type { BadgeTone } from '../../ui';
import type { Database } from '../../core/database.types';

type Enums = Database['public']['Enums'];

export type JobStatus = Enums['print_job_status'];
export type FailureCause = Enums['print_failure_cause'];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  planned: 'Planificado',
  printing: 'Imprimiendo',
  success: 'Exitoso',
  failed: 'Fallido',
  cancelled: 'Cancelado',
};

export const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  planned: 'neutral',
  printing: 'info',
  success: 'good',
  failed: 'bad',
  cancelled: 'warn',
};

/** Open first, then the history. */
export const JOB_STATUS_ORDER: JobStatus[] = ['printing', 'planned', 'success', 'failed', 'cancelled'];

export const FAILURE_CAUSE_LABEL: Record<FailureCause, string> = {
  adhesion: 'Adhesión a la placa',
  clog: 'Atasco de boquilla',
  spaghetti: 'Spaghetti (hilos sueltos)',
  layer_shift: 'Capa desplazada',
  filament_runout: 'Se acabó el filamento',
  power_loss: 'Corte de luz',
  wrong_settings: 'Configuración equivocada',
  warping: 'Warping / deformación',
  other: 'Otra causa',
};

export const FAILURE_CAUSES = Object.keys(FAILURE_CAUSE_LABEL) as FailureCause[];

export function isClosed(status: JobStatus): boolean {
  return status === 'success' || status === 'failed' || status === 'cancelled';
}
