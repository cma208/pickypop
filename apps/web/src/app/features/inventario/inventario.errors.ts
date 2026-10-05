import { friendlyError } from '../../core/friendly-error';

/**
 * Same sentence `friendlyError` gives for a unique violation it knows nothing
 * else about. Asking for it with a bare code keeps this in step with that file
 * instead of copying the text here.
 */
const GENERIC_DUPLICATE = friendlyError({ code: '23505' }, '');

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
