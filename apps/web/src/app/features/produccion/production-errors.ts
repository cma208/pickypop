import { explainError } from '../pedidos/pedidos.errors';

/**
 * PostgREST did not find the function (PGRST202) or the column (PGRST204)
 * the screen asked for: the app and the database are not the same version.
 * It happens in the minutes between publishing one and migrating the other,
 * or in a tab left open across an update.
 */
const OUT_OF_SYNC_CODES = new Set(['PGRST202', 'PGRST204']);

/** Postgres refused for lack of a privilege: a row policy, or the right to run a function. */
const NO_PRIVILEGE = '42501';

export const OUT_OF_SYNC_MESSAGE =
  'La aplicación y la base de datos no están en la misma versión: recarga la página. Si sigue igual, avísale al dueño, que falta publicar una parte de la actualización. No se movió nada.';

/**
 * Said as a possibility, not a fact: the screen reads the role again on its
 * own (`afterRefusal`) and stops offering what a new role cannot do, but the
 * same 42501 comes when the hosted project lacks the right to run a function
 * (a migration half published), and then the role did not change and the
 * button stays.
 */
export const NO_PRIVILEGE_MESSAGE =
  'No tienes permiso para hacer esto. Si tu rol en el taller cambió, la pantalla ya muestra lo que puedes hacer; si te lo sigue ofreciendo, avísale al dueño: puede faltar publicar una parte de la actualización.';

/**
 * What production, assembly and the shelf count say before the general
 * translation: a generic «inténtalo de nuevo» here would be retried forever,
 * and «solo el dueño» would be wrong, because operators do this work.
 */
export function productionProblem(error: unknown): string | null {
  const code = codeOf(error);
  if (code !== null && OUT_OF_SYNC_CODES.has(code)) return OUT_OF_SYNC_MESSAGE;
  if (code === NO_PRIVILEGE) return NO_PRIVILEGE_MESSAGE;
  return null;
}

/** `explainError`, with what production knows better first. */
export function explainProductionError(error: unknown, fallback: string): string {
  return productionProblem(error) ?? explainError(error, fallback);
}

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}
