import type { PostgrestError } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

/**
 * PostgREST returns at most 1000 rows per request. This walks the pages so a
 * growing table (print jobs, maintenance logs) never gets silently truncated.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
