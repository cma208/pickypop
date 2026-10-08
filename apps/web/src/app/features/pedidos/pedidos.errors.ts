import { friendlyError, UserFacingError } from '../../core/friendly-error';

/**
 * Rules of orders and print jobs that people can run into, explained in plain
 * Spanish. Everything else (a permission, a number too large, the network, a
 * rule of another area) is `friendlyError`'s: two lists that say the same
 * thing in two ways drift apart.
 */
const KNOWN_ERRORS: [needle: string, message: string][] = [
  ['orders_sale_needs_customer', 'Una venta necesita un cliente. Elige uno o crea uno nuevo.'],
  ['orders_gift_needs_category', 'Un regalo necesita una categoría.'],
  ['orders_only_sales_have_total', 'Solo las ventas llevan precio. Un regalo o uso personal queda en cero.'],
  ['print_jobs_failure_needs_cause', 'Una impresión fallida necesita su causa.'],
  ['a failed job needs a cause', 'Una impresión fallida necesita su causa.'],
  ['print_jobs_finished_after_start', 'La hora de fin no puede ser anterior a la de inicio.'],
  ['orders_workspace_id_number_key', 'Ese número de pedido ya existe. Inténtalo otra vez.'],
];

/** Turns whatever came back from Supabase into something to show on screen. */
export function explainError(error: unknown, fallback: string): string {
  // Checked first: some older checks raise in English and are translated here.
  const text = describe(error);
  const known = KNOWN_ERRORS.find(([needle]) => text.includes(needle));
  if (known) return known[1];

  // The database already said what is missing and how much ("No alcanza para
  // entregar…"): friendlyError shows a `P0001` word for word, and says what
  // went wrong with a number too large (T3-14) instead of the fallback.
  return friendlyError(error, fallback);
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const { message, details } = error as { message?: unknown; details?: unknown };
    return `${String(message ?? '')} ${String(details ?? '')}`;
  }
  return String(error);
}

/**
 * Whether the database answered and said no: then nothing was saved. A
 * network failure has no code, and the write may have been saved before the
 * answer got lost: the screen asks by its key before saying it failed.
 */
export function refusedByDatabase(error: unknown): boolean {
  if (error instanceof UserFacingError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && code.trim() !== '';
}
