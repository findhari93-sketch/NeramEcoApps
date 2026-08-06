/**
 * Read every row of a PostgREST query, not just the first page of them.
 *
 * WHY THIS EXISTS, because the bug it fixes is invisible and the workaround that
 * failed looks correct:
 *
 *   supabase.from('nexus_test_questions').select('test_id').in('test_id', ids).range(0, 100000)
 *
 * `.range(0, 100000)` reads as "give me everything". It does not. PostgREST
 * applies its own `db-max-rows` ceiling (1000 on this project) AFTER the caller's
 * range, and silently returns a short page with no error and no truncation flag.
 * Six call sites tallied counts this way, so any row past the thousandth was
 * dropped and the tally it fed came back wrong, usually as a confident zero.
 *
 * Measured on production 2026-08-06: 28 student-built tests hold 1,236
 * nexus_test_questions rows between them. The teacher's "Student tests" tab
 * therefore reported 0 questions for six papers that have between 20 and 49, and
 * reported 4 questions for a paper holding 27. The truncation follows the index
 * order of the `.in()` column, so which tests break is arbitrary and moves as
 * rows are added, which is why it went unnoticed for months.
 *
 * A count is a claim about all the data. Never make one from a single page.
 */

import type { TypedSupabaseClient } from '../client';

/**
 * PostgREST refuses to return more than this per request whatever the caller
 * asks for, so it is also the largest useful page size. Kept below the 1000
 * server ceiling on purpose: a page that comes back exactly full is
 * indistinguishable from a page that was truncated, and the loop below relies on
 * a short page to know it has reached the end.
 */
const PAGE_SIZE = 500;

/**
 * Guard against an unbounded loop if a query somehow never returns a short page.
 * 200 pages is 100,000 rows, far above anything this codebase tallies.
 */
const MAX_PAGES = 200;

/** The shape both callers below need: something rangeable that resolves to rows. */
interface Rangeable<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
}

/**
 * Run a query to exhaustion, one page at a time.
 *
 * `build` is called once per page rather than being handed a single query
 * object, because a PostgREST builder is single-use: calling `.range()` twice on
 * the same instance mutates and re-sends the same request. Every page therefore
 * gets a freshly built query.
 *
 * @example
 *   const rows = await fetchAllRows(() =>
 *     supabase.from('nexus_test_questions').select('test_id').in('test_id', ids),
 *   );
 */
export async function fetchAllRows<T>(build: () => Rangeable<T>): Promise<T[]> {
  const out: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);

    // Loud, not degraded. A partial tally that reports itself as complete is
    // exactly the failure this module exists to end, so a mid-page error stops
    // the read rather than returning what happened to arrive first.
    if (error) throw error;

    const rows = data || [];
    out.push(...rows);

    // A short page is the only reliable end-of-data signal PostgREST gives.
    if (rows.length < PAGE_SIZE) return out;
  }

  return out;
}

/**
 * Tally rows per key: the one thing all six broken call sites were doing.
 *
 * Returns a Map rather than a plain object so a caller cannot confuse a missing
 * key with a zero count, and so uuid keys never collide with Object.prototype.
 *
 * @example
 *   const perTest = await countRowsByKey(
 *     () => supabase.from('nexus_test_questions').select('test_id').in('test_id', ids),
 *     'test_id',
 *   );
 */
export async function countRowsByKey<K extends string>(
  build: () => Rangeable<Record<K, string>>,
  key: K,
): Promise<Map<string, number>> {
  const rows = await fetchAllRows(build);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row?.[key];
    if (typeof id !== 'string') continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

/**
 * `countRowsByKey` for the common case of "count child rows for these parent
 * ids", which additionally has to survive a long id list.
 *
 * PostgREST puts `.in()` values in the URL, so a few thousand uuids overflow the
 * request line and come back as a 414 rather than as data. Ids are therefore
 * chunked, and each chunk is itself read to exhaustion.
 */
export async function countRowsForIds(
  client: TypedSupabaseClient,
  table: string,
  keyColumn: string,
  ids: string[],
  /** Extra narrowing applied to every chunk, e.g. (q) => q.eq('status', 'submitted'). */
  refine?: (query: any) => any,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return counts;

  const ID_CHUNK = 200;
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const chunkCounts = await countRowsByKey(() => {
      const base = (client as any).from(table).select(keyColumn).in(keyColumn, chunk);
      return refine ? refine(base) : base;
    }, keyColumn as any);
    for (const [id, n] of chunkCounts) counts.set(id, (counts.get(id) || 0) + n);
  }

  return counts;
}
