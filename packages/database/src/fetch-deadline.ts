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
 *
 * The first hop is optional on the server. The Worker exists because some ISPs
 * block supabase.co for BROWSERS; a Vercel function is not behind them. When the
 * server-only env var SUPABASE_SERVER_URL (https://<ref>.supabase.co) is set,
 * server requests addressed to NEXT_PUBLIC_SUPABASE_URL are re-pointed at it,
 * which saves a hop on every query. Only the outgoing request moves: the client's
 * base URL stays public, so storage public and signed URLs handed to browsers
 * still use the proxy host. Never in the browser: it cannot read the variable,
 * and serverSupabaseOrigin refuses to answer there anyway.
 */

export const SUPABASE_REST_DEADLINE_MS = 20_000;

const HAS_DEADLINE = /\/(rest|auth)\/v1\//;

function originOf(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The direct Supabase origin for server-side requests, or null to keep using the
 * public (proxied) URL. Always null in a browser.
 */
export function serverSupabaseOrigin(): string | null {
  if (typeof window !== 'undefined') return null;
  return originOf(process.env.SUPABASE_SERVER_URL);
}

/**
 * Re-points a request for the public Supabase URL at SUPABASE_SERVER_URL when
 * that is set (server only). Anything else is returned untouched.
 */
export function toServerSupabaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  const server = serverSupabaseOrigin();
  if (!server) return input;
  const publicOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!publicOrigin || publicOrigin === server) return input;

  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (href !== publicOrigin && !href.startsWith(`${publicOrigin}/`)) return input;
  const target = server + href.slice(publicOrigin.length);

  if (typeof input === 'string') return target;
  if (input instanceof URL) return new URL(target);
  return new Request(target, input);
}

export function deadlineFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const target = toServerSupabaseUrl(input);
  // Bypass the Next.js fetch cache: every admin read must see current data.
  if (!HAS_DEADLINE.test(url)) return fetch(target, { ...init, cache: 'no-store' });

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

  return fetch(target, { ...init, cache: 'no-store', signal: controller.signal })
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
