/**
 * Turns database and network failures into sentences a person can act on.
 * Screens never print raw Postgres messages.
 */

/** An error whose message is already written for the user. */
export class UserFacingError extends Error {}

const NO_PERMISSION =
  'No tienes permiso para hacer este cambio. La configuración y las anulaciones son solo del dueño del taller, y quien es de solo lectura no registra nada.';

const TOO_LARGE_LEAD = 'Uno de los números es demasiado grande para guardarse';
const TOO_LARGE = `${TOO_LARGE_LEAD}. Revísalo: así no se puede guardar.`;
const NOT_A_NUMBER = 'Uno de los valores no es un número válido. Revísalo.';
const NOT_WHOLE = 'Una cantidad que va entera tiene decimales. Escríbela sin decimales.';
const BROKEN_RULE = 'Alguno de los valores no cumple las reglas del sistema. Revisa los datos.';
const NAME_MISSING = 'Escribe el nombre: no puede quedar vacío ni tener solo espacios.';

/**
 * The ledgers are appended to, never rewritten (ADR-025). Without the
 * privilege the database says "permission denied for table …", and the
 * generic sentence would wrongly suggest the owner could do it.
 */
const LEDGER_MESSAGES: Record<string, string> = {
  transactions: 'Un movimiento de dinero ya registrado no se edita ni se borra: se anula, con su motivo.',
  stock_movements:
    'Un movimiento de stock ya registrado no se edita ni se borra: se corrige con otro movimiento (un pesaje del rollo o un conteo del estante).',
  order_deliveries: 'Una entrega ya registrada no se edita ni se borra.',
  order_delivery_lines: 'Una entrega ya registrada no se edita ni se borra.',
};

const DUPLICATE_ACCOUNT = 'Ya existe una cuenta con ese nombre (las mayúsculas y los espacios no cuentan).';
const DUPLICATE_CATEGORY = 'Ya existe una categoría con ese nombre para ese tipo (las mayúsculas no cuentan).';
const DUPLICATE_ITEM =
  'Ya existe un artículo de ese tipo con ese nombre (las mayúsculas no cuentan). Si no lo ves en la lista, está desactivado.';
const DUPLICATE_FILAMENT =
  'Ese filamento ya existe: misma marca, material, acabado, color, peso y diámetro (las mayúsculas del color no cuentan).';
const DUPLICATE_PRINTER = 'Ya hay una impresora con ese nombre. Usa otro para distinguirlas.';

/** Constraint names from the migrations, mapped to what went wrong. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  customers_dni_format: 'El DNI debe tener exactamente 8 dígitos, sin espacios ni letras.',
  customers_ruc_format: 'El RUC debe tener exactamente 11 dígitos, sin espacios ni letras.',
  customers_doc_number_needed: 'Indica el número de documento.',
  customers_name_check: 'Escribe el nombre del cliente.',
  workspaces_ruc_check: 'El RUC debe tener exactamente 11 dígitos.',
  workspaces_name_check: 'Escribe el nombre del taller: no puede quedar vacío.',
  cost_profiles_workspace_id_valid_from_key:
    'Ya existe una versión con esa fecha de vigencia. Elige otra fecha.',
  cost_profiles_material_waste_rate_check: 'La merma de material debe estar entre 0 % y 99.99 %.',
  cost_profiles_failure_rate_check: 'La tasa de fallo debe estar entre 0 % y 99.99 %.',
  cost_profiles_target_margin_check: 'El margen objetivo debe estar entre 0 % y 99.99 %.',
  cost_profiles_igv_rate_check: 'El IGV debe estar entre 0 % y 99.99 %.',
  cost_profiles_labor_rate_per_hour_check: 'La hora de trabajo no puede ser negativa.',
  cost_profiles_energy_rate_per_kwh_check: 'La tarifa eléctrica no puede ser negativa.',
  cost_profiles_min_order_price_check: 'El precio mínimo no puede ser negativo.',
  cost_profiles_rounding_step_check: 'El redondeo no puede ser negativo.',
  workshop_settings_check: 'La última placa tiene que poder empezar después de la primera.',
  workshop_settings_check1:
    'La última placa no puede empezar después de la hora en que todo tiene que haber terminado.',
  workshop_settings_changeover_default_minutes_check: 'El cambio de placa no puede ser negativo.',
  workshop_settings_changeover_fits_a_day: 'El cambio de placa no puede pasar de 24 horas (1440 minutos).',
  workshop_settings_hold_days_reasonable: 'Un separo por defecto no puede durar más de 30 días.',
  sales_channels_workspace_id_name_key: 'Ya existe un canal con ese nombre.',
  sales_channels_name_ci_key: 'Ya existe un canal con ese nombre (las mayúsculas y los espacios no cuentan).',
  sales_channels_name_check: 'Escribe el nombre del canal: no puede quedar vacío.',
  sales_channels_commission_rate_check: 'La comisión debe estar entre 0 % y 99.99 %.',
  accounts_workspace_id_name_key: DUPLICATE_ACCOUNT,
  accounts_name_ci_key: DUPLICATE_ACCOUNT,
  accounts_name_check: 'Escribe el nombre de la cuenta: no puede quedar vacío.',
  transaction_categories_workspace_id_direction_name_key: DUPLICATE_CATEGORY,
  transaction_categories_name_ci_key: DUPLICATE_CATEGORY,
  transaction_categories_name_check: 'Escribe el nombre de la categoría: no puede quedar vacío.',
  transaction_categories_capital_is_not_sales:
    'Una categoría no puede ser de capital y de ventas a la vez: los aportes y retiros del dueño no son ventas. Desmarca una de las dos.',
  transactions_workspace_entry_key_key:
    'Ese movimiento ya quedó registrado: llegó dos veces. Revisa la Caja antes de anotarlo de nuevo.',
  filament_skus_color_name_not_blank: 'Escribe el nombre del color: no puede quedar vacío ni tener solo espacios.',
  inventory_items_unit_not_blank: 'Escribe la unidad (unidad, g, ml…): no puede quedar vacía ni tener solo espacios.',
  gift_categories_workspace_id_name_key: 'Ya existe una categoría con ese nombre.',
  gift_categories_name_ci_key: 'Ya existe una categoría de regalo con ese nombre (las mayúsculas no cuentan).',
  gift_categories_name_check: 'Escribe el nombre de la categoría: no puede quedar vacío.',
  maintenance_plans_needs_a_trigger:
    'Indica cada cuántas horas o cada cuántos días toca la tarea (o ambas).',
  maintenance_plans_task_check: 'Escribe qué hay que hacer.',
  printer_components_printer_idx: 'Ese componente ya está registrado.',
  printers_workspace_id_name_key: DUPLICATE_PRINTER,
  printers_name_ci_key: DUPLICATE_PRINTER,
  printers_name_check: 'Escribe el nombre de la impresora: no puede quedar vacío.',
  printers_avg_power_w_check: 'La potencia media no puede ser negativa.',
  printers_initial_hours_check: 'Las horas iniciales no pueden ser negativas.',
  printers_maintenance_budget_per_year_check: 'El presupuesto de mantenimiento no puede ser negativo.',
  printers_expected_hours_per_year_check: 'Las horas esperadas al año no pueden ser negativas.',
  assets_cost_check: 'El costo de la impresora no puede ser negativo.',
  assets_useful_life_hours_check: 'La vida útil no puede ser negativa.',
  brands_workspace_id_name_key: 'Ya existe una marca con ese nombre.',
  brands_name_ci_key: 'Ya existe una marca con ese nombre (las mayúsculas no cuentan).',
  materials_workspace_id_code_key: 'Ya existe un material con ese código.',
  materials_code_ci_key: 'Ya existe un material con ese código.',
  filament_finishes_workspace_id_name_key: 'Ya existe un acabado con ese nombre.',
  filament_finishes_name_ci_key: 'Ya existe un acabado con ese nombre (las mayúsculas no cuentan).',
  inventory_items_workspace_id_kind_name_key: DUPLICATE_ITEM,
  inventory_items_name_ci_key: DUPLICATE_ITEM,
  filament_skus_identity_idx: DUPLICATE_FILAMENT,
  filament_skus_identity_ci_key: DUPLICATE_FILAMENT,
};

interface PostgrestLike {
  code?: string;
  message?: string;
  details?: string;
}

export function permissionError(): UserFacingError {
  return new UserFacingError(NO_PERMISSION);
}

/**
 * A function that checks the role on its own may say so in words, as a plain
 * `raise exception` (P0001) and not a 42501: «Solo el dueño del taller puede
 * anular un movimiento de dinero.» (`void_transaction`), or the one about
 * unmarking a sales category. It is as much a refusal of who is asking.
 */
const OWNER_ONLY_REFUSAL = /^Solo el dueño del taller puede /;

/**
 * The database said no to who is asking, not to what they wrote. An error
 * already translated for a screen keeps what the database said as its
 * `cause`, so the role is read again after it too.
 */
export function isPermissionError(error: unknown): boolean {
  if (error instanceof UserFacingError) {
    return (
      error.message === NO_PERMISSION ||
      OWNER_ONLY_REFUSAL.test(error.message) ||
      (error.cause !== undefined && isPermissionError(error.cause))
    );
  }
  const { code, message } = (error ?? {}) as PostgrestLike;
  const text = message ?? '';
  if (code === 'P0001') return OWNER_ONLY_REFUSAL.test(text);
  return code === '42501' || text.includes('row-level security') || text.includes('permission denied');
}

export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;

  const { code, message, details } = (error ?? {}) as PostgrestLike;
  const text = message ?? '';

  const known = constraintMessage(text);
  if (known) return known;

  // `P0001` es un `raise exception` de plpgsql: alguien escribió ese texto a
  // mano, para una persona, y sabe más del caso que cualquier regla de aquí.
  // Son los mensajes que dicen qué falta y cuánto, como el del sobrepago de
  // `record_payment` o el de armar sin piezas suficientes.
  if (code === 'P0001' && text.trim() !== '') return text;

  if (code === '42501' || text.includes('row-level security') || text.includes('permission denied')) {
    return ledgerMessage(text) ?? handWrittenRefusal(code, text) ?? NO_PERMISSION;
  }
  // Reintentar no arregla un número que no cabe: se dice qué pasó y cuánto cabe.
  if (code === '22003') return tooLargeMessage(text, details ?? '');
  if (code === '22P02') return /type (integer|bigint|smallint)/.test(text) ? NOT_WHOLE : NOT_A_NUMBER;
  if (code === '23505') return 'Ya existe un registro con esos datos.';
  if (code === '23503') return 'Este registro está en uso en otra parte y no se puede modificar así.';
  if (code === '23514') return BROKEN_RULE;
  if (text.includes('Failed to fetch') || text.includes('NetworkError')) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }

  return fallback;
}

/**
 * The constraint a message names, read exactly: `workshop_settings_check` is
 * a prefix of `workshop_settings_check1`, so "contains" would pick the wrong
 * one. A name check nobody mapped still says what to do.
 */
function constraintMessage(text: string): string | null {
  const name = /constraint "([^"]+)"/.exec(text)?.[1];
  if (name) {
    if (CONSTRAINT_MESSAGES[name]) return CONSTRAINT_MESSAGES[name];
    if (name.endsWith('_name_check')) return NAME_MISSING;
    return null;
  }

  for (const [constraint, explanation] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(constraint)) return explanation;
  }
  return null;
}

/**
 * A function that refuses by role raises 42501 with a sentence of its own
 * (`save_printer`: «Solo el dueño del taller puede…»). That sentence says
 * more than the generic one; PostgreSQL's own wording does not.
 */
function handWrittenRefusal(code: string | undefined, text: string): string | null {
  if (code !== '42501' || text.trim() === '') return null;
  if (/permission denied|row-level security|must be owner/.test(text)) return null;
  return text;
}

function ledgerMessage(text: string): string | null {
  const table = /permission denied for (?:table|relation) "?(\w+)"?/.exec(text)?.[1];
  return table ? (LEDGER_MESSAGES[table] ?? null) : null;
}

const INTEGER_LIMITS: Record<string, number> = {
  smallint: 32_767,
  integer: 2_147_483_647,
  bigint: Number.MAX_SAFE_INTEGER,
};

/**
 * "A field with precision 12, scale 2 must round to an absolute value less
 * than 10^10" means the largest that fits is 9,999,999,999.99.
 */
function tooLargeMessage(text: string, details: string): string {
  const numeric = /precision (\d+), scale (\d+)/.exec(details);
  if (numeric) {
    const precision = Number(numeric[1]);
    const scale = Number(numeric[2]);
    const largest = 10 ** (precision - scale) - 10 ** -scale;
    return `${TOO_LARGE_LEAD}: aquí el máximo es ${formatLimit(largest, scale)}. Revísalo; así no se puede guardar.`;
  }

  const integer = /out of range for type (smallint|integer|bigint)/.exec(text);
  if (integer) {
    return `${TOO_LARGE_LEAD}: aquí el máximo es ${formatLimit(INTEGER_LIMITS[integer[1]], 0)}. Revísalo; así no se puede guardar.`;
  }

  return TOO_LARGE;
}

function formatLimit(value: number, decimals: number): string {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
