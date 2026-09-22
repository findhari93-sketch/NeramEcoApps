/**
 * Small async helpers for work that must fit inside a serverless function.
 *
 * Two private copies of mapWithConcurrency predate this file (ms-offboard.ts and
 * ms-photo-sync.ts, the latter with Graph-throttle jitter). They are left alone
 * because they work; new callers should import from here.
 */

/** Run an async fn over items with a bounded concurrency. */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * A wall-clock budget for a loop that would otherwise run until the function is
 * killed. A killed function returns nothing at all, so the caller cannot tell a
 * slow run from a broken one; spending the budget and reporting a partial result
 * is always the better failure.
 */
export function deadline(budgetMs: number): { expired: () => boolean; elapsedMs: () => number } {
  const startedAt = Date.now();
  return {
    expired: () => Date.now() - startedAt >= budgetMs,
    elapsedMs: () => Date.now() - startedAt,
  };
}
