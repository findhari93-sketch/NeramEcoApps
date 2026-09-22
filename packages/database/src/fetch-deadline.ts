/**
 * The fetch the service-role client uses: never cached, and never allowed to hang.
 *
 * Server queries travel function -> db.neramclasses.com (the Cloudflare Worker that
 * gets around ISP blocks on supabase.co) -> supabase.co. None of those hops had a
 * deadline, so one that stalled held the whole route open until Cloudflare cut it
 * at 100s, which surfaced in Nexus as 524s on the bell and badge pollers.
 *
 * PostgREST (tables and RPCs) and auth get a deadline. The slowest statement the
 * service role has ever run in production took 3.2s (pg_stat_statements,
 * 2026-09-21), and a PostgREST schema reload can add about 7s, so 20s leaves
 * room for both and still fails long before the platform does. Storage keeps no
 * deadline: uploading a large file legitimately takes longer than any query.
 */

export const SUPABASE_REST_DEADLINE_MS = 20_000;

const HAS_DEADLINE = /\/(rest|auth)\/v1\//;

export function deadlineFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  // Bypass the Next.js fetch cache: every admin read must see current data.
  const base: RequestInit = { ...init, cache: 'no-store' as RequestCache };
  if (!HAS_DEADLINE.test(url)) return fetch(input, base);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SUPABASE_REST_DEADLINE_MS);
  // Keep honouring an abort the caller asked for (supabase-js .abortSignal()).
  const onCallerAbort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', onCallerAbort, { once: true });

  return fetch(input, { ...base, signal: controller.signal })
    .catch((err: unknown) => {
      if (timedOut) {
        throw new Error(`Supabase request timed out after ${SUPABASE_REST_DEADLINE_MS}ms: ${new URL(url).pathname}`);
      }
      throw err;
    })
    .finally(() => {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onCallerAbort);
    });
}
