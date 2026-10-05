/**
 * Turns a Supabase / network failure into a sentence a person at the workshop
 * can act on. The technical message is never shown; it goes to the console.
 */
interface ErrorLike {
  code?: string;
  message?: string;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const INSUFFICIENT_PRIVILEGE = '42501';

export function describeError(error: unknown, fallback: string, duplicate?: string): string {
  console.error(error);

  const { code, message } = (error ?? {}) as ErrorLike;

  switch (code) {
    case UNIQUE_VIOLATION:
      return duplicate ?? 'Ya existe un registro igual. Revisa los datos e inténtalo de nuevo.';
    case FOREIGN_KEY_VIOLATION:
      return 'Ese dato está en uso o ya no existe. Recarga la pantalla e inténtalo de nuevo.';
    case CHECK_VIOLATION:
    case NOT_NULL_VIOLATION:
      return 'Hay un dato inválido o incompleto. Revisa el formulario.';
    case INSUFFICIENT_PRIVILEGE:
      return 'No tienes permiso para hacer esto en este taller.';
    default:
      break;
  }

  if (message && /failed to fetch|network|load failed/i.test(message)) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo otra vez.';
  }

  return fallback;
}
