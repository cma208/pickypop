import { friendlyError, UserFacingError } from '../../core/friendly-error';

/**
 * Same sentence `friendlyError` gives for a unique violation it knows nothing
 * else about. Asking for it with a bare code keeps this in step with that file
 * instead of copying the text here.
 */
const GENERIC_DUPLICATE = friendlyError({ code: '23505' }, '');

/** What is said when a request got no answer that explains itself. */
const NO_ANSWER = 'La respuesta del servidor no llegó.';

/**
 * Turns a Supabase / network failure into a sentence a person at the workshop
 * can act on. The wording lives in `friendlyError`, so a constraint it has been
 * taught (a duplicate brand, a duplicate finish...) reads the same on every
 * screen. The technical message goes to the console, never to the screen.
 *
 * `duplicate` only replaces the generic "already exists" sentence: a screen
 * that can say exactly what collided (a filament's brand + colour + size) is
 * more useful than "a record with that data", but it must not hide a duplicate
 * that `friendlyError` can already name.
 */
export function describeError(error: unknown, fallback: string, duplicate?: string): string {
  console.error(error);

  const message = friendlyError(error, fallback);
  return duplicate && message === GENERIC_DUPLICATE ? duplicate : message;
}

/**
 * Whether a failed request may have been carried out anyway.
 *
 * A refusal from the database comes back with a code: a Postgres one (P0001,
 * 23514, 42501…) or PostgREST's (PGRST…). The transaction was rolled back and
 * nothing was written, so «No se guardó nada» is true. A request that got no
 * such answer — no connection, the answer lost on the way back, a gateway page
 * instead of JSON — comes back with an empty code or none: the database may
 * well have written it and committed. Saying «No se guardó nada» then is how a
 * purchase gets registered twice; the screen has to say it does not know, and
 * ask again with the same key.
 */
export function outcomeUnknown(error: unknown): boolean {
  if (error instanceof UserFacingError) return false;
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code !== 'string' || code.trim() === '';
}

/** Why the answer did not arrive, in the words `friendlyError` uses for it. */
export function noAnswerReason(error: unknown): string {
  return describeError(error, NO_ANSWER);
}
