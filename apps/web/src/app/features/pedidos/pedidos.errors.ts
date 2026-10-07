import { UserFacingError } from '../../core/friendly-error';

/** SQLSTATE of a `raise exception` in plpgsql: a message written for a person. */
const RAISED_BY_DATABASE = 'P0001';

/** Database rules that people can run into, explained in plain Spanish. */
const KNOWN_ERRORS: [needle: string, message: string][] = [
  ['orders_sale_needs_customer', 'Una venta necesita un cliente. Elige uno o crea uno nuevo.'],
  ['orders_gift_needs_category', 'Un regalo necesita una categoría.'],
  ['orders_only_sales_have_total', 'Solo las ventas llevan precio. Un regalo o uso personal queda en cero.'],
  ['print_jobs_failure_needs_cause', 'Una impresión fallida necesita su causa.'],
  ['a failed job needs a cause', 'Una impresión fallida necesita su causa.'],
  ['is already closed', 'Esta impresión ya estaba cerrada.'],
  ['print_jobs_finished_after_start', 'La hora de fin no puede ser anterior a la de inicio.'],
  ['print_job_filaments_print_job_id_spool_id_key', 'Elegiste el mismo rollo dos veces. Usa una sola fila por rollo.'],
  ['orders_workspace_id_number_key', 'Ese número de pedido ya existe. Inténtalo otra vez.'],
  ['customers_dni_format', 'El DNI debe tener 8 dígitos.'],
  ['customers_ruc_format', 'El RUC debe tener 11 dígitos.'],
  ['row-level security', 'No tienes permiso para hacer esto.'],
  ['Failed to fetch', 'No hay conexión con el servidor. Revisa tu internet e inténtalo otra vez.'],
];

/** Turns whatever came back from Supabase into something to show on screen. */
export function explainError(error: unknown, fallback: string): string {
  const text = describe(error);
  // Checked first: some older checks raise in English and are translated here.
  const known = KNOWN_ERRORS.find(([needle]) => text.includes(needle));
  if (known) return known[1];

  // The database already said what is missing and how much ("No alcanza para
  // entregar…", "Para marcar el pedido … hay que entregarlo"). A generic
  // sentence here would hide exactly what the person needs to know.
  if (error instanceof UserFacingError) return error.message;
  if (isRaisedByDatabase(error)) return (error as { message: string }).message;
  return fallback;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const { message, details } = error as { message?: unknown; details?: unknown };
    return `${String(message ?? '')} ${String(details ?? '')}`;
  }
  return String(error);
}

function isRaisedByDatabase(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === RAISED_BY_DATABASE && typeof message === 'string' && message.trim() !== '';
}
