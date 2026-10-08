/**
 * The key a form sends so the database can tell a repeated submission from a
 * new one (`print_jobs.request_key`).
 *
 * The same thing sent again keeps its key: a retry after a cut connection,
 * when the first try did reach the database, gets back what it made instead of
 * a second job. Anything changed is a new submission with a new key.
 */
export interface SentRequest<T> {
  key: string;
  payload: T;
}

export function requestKey<T>(last: SentRequest<T> | null, payload: T, newKey: () => string): SentRequest<T> {
  if (last && JSON.stringify(last.payload) === JSON.stringify(payload)) return last;
  return { key: newKey(), payload };
}
