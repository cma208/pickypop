/**
 * Turns database and network failures into sentences a person can act on.
 * Screens never print raw Postgres messages.
 */

/** An error whose message is already written for the user. */
export class UserFacingError extends Error {}

const NO_PERMISSION =
  'No tienes permiso para hacer este cambio. Solo el dueño del taller puede modificar estos datos.';

/** Constraint names from the migrations, mapped to what went wrong. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  customers_dni_format: 'El DNI debe tener exactamente 8 dígitos, sin espacios ni letras.',
  customers_ruc_format: 'El RUC debe tener exactamente 11 dígitos, sin espacios ni letras.',
  customers_doc_number_needed: 'Indica el número de documento.',
  workspaces_ruc_check: 'El RUC debe tener exactamente 11 dígitos.',
  cost_profiles_workspace_id_valid_from_key:
    'Ya existe una versión con esa fecha de vigencia. Elige otra fecha.',
  sales_channels_workspace_id_name_key: 'Ya existe un canal con ese nombre.',
  gift_categories_workspace_id_name_key: 'Ya existe una categoría con ese nombre.',
  maintenance_plans_needs_a_trigger:
    'Indica cada cuántas horas o cada cuántos días toca la tarea (o ambas).',
  printer_components_printer_idx: 'Ese componente ya está registrado.',
  printers_workspace_id_name_key: 'Ya hay una impresora con ese nombre. Usa otro para distinguirlas.',
  brands_workspace_id_name_key: 'Ya existe una marca con ese nombre.',
  materials_workspace_id_code_key: 'Ya existe un material con ese código.',
  filament_finishes_workspace_id_name_key: 'Ya existe un acabado con ese nombre.',
};

interface PostgrestLike {
  code?: string;
  message?: string;
}

export function permissionError(): UserFacingError {
  return new UserFacingError(NO_PERMISSION);
}

export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;

  const { code, message } = (error ?? {}) as PostgrestLike;
  const text = message ?? '';

  for (const [constraint, explanation] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(constraint)) return explanation;
  }

  if (code === '42501' || text.includes('row-level security')) return NO_PERMISSION;
  if (code === '23505') return 'Ya existe un registro con esos datos.';
  if (code === '23503') return 'Este registro está en uso en otra parte y no se puede modificar así.';
  if (code === '23514') return 'Alguno de los valores no cumple las reglas del sistema. Revisa los datos.';
  if (text.includes('Failed to fetch') || text.includes('NetworkError')) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }

  return fallback;
}
