/**
 * The key that names one write sent to the database (a payment, an order, a
 * quote), so that sending it twice makes it once (T4-01, T4-04).
 *
 * The same write sent again keeps its key: after a double click, or an
 * answer that never arrived, the database returns what it already made
 * instead of making it twice. Anything changed is another write, with a key
 * of its own: a key kept across a change would bring back the first one and
 * silently drop the change.
 */
export interface SentRequest<T> {
  key: string;
  payload: T;
}

export function requestKey<T>(
  last: SentRequest<T> | null,
  payload: T,
  newKey: () => string = () => crypto.randomUUID(),
): SentRequest<T> {
  if (last && JSON.stringify(last.payload) === JSON.stringify(payload)) return last;
  return { key: newKey(), payload };
}
