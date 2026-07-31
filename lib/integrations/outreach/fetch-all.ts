/**
 * Paged fetch for tables that outgrow PostgREST's silent 1,000-row cap.
 *
 * Supabase truncates every select at 1,000 rows without an error — with a
 * 4,900-prospect list, `getOutreachSnapshot` was returning an arbitrary 1,000
 * prospects and hiding the rest (including every personalized draft) from the
 * whole UI. Callers pass a page factory because a PostgREST query builder is
 * single-use; the factory must apply a DETERMINISTIC order with a unique
 * tiebreaker (e.g. `.order('created_at').order('id')`) or rows can be skipped
 * or duplicated across page boundaries when timestamps tie (bulk ingests give
 * thousands of rows the same created_at).
 *
 * A page error logs and returns what was fetched so far — same degrade-to-
 * partial behavior the callers already had with single unchecked selects.
 */

const PAGE_SIZE = 1000

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error(`[outreach] paged fetch failed at offset ${from}: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all
}
