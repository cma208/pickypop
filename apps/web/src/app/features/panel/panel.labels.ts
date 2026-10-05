import type { Database } from '../../core/database.types';

export const ORDER_STATUS_LABELS: Record<Database['public']['Enums']['order_status'], string> = {
  confirmed: 'Confirmados',
  queued: 'En cola',
  printing: 'Imprimiendo',
  post_processing: 'En postproceso',
  ready: 'Listos para entregar',
  delivered: 'Entregados',
  closed: 'Cerrados',
  on_hold: 'En pausa',
  cancelled: 'Cancelados',
};

export const FAILURE_CAUSE_LABELS: Record<Database['public']['Enums']['print_failure_cause'], string> = {
  adhesion: 'adhesión a la placa',
  clog: 'atasco de boquilla',
  spaghetti: 'espagueti',
  layer_shift: 'capas desplazadas',
  filament_runout: 'se acabó el filamento',
  power_loss: 'corte de luz',
  wrong_settings: 'ajustes incorrectos',
  other: 'otra causa',
};
