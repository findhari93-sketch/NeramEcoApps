/**
 * The media Worker's request handler, with its platform pieces injected.
 *
 * index.ts wires in the real `fetch`, `caches.default` and `ctx.waitUntil`;
 * tests wire in fakes. Nothing in this file touches a Worker-only global, so
 * Vitest (and the Nexus type-check) can import it directly.
 *
 * Flow for GET /recording?vt=vid_...:
 *   1. Verify the HMAC grant locally (no network). Bad or expired: 401.
 *   2. Find the file's source {downloadUrl, mime, size}: Worker cache first,
 *      keyed scope:refId for 30 minutes, else ask Nexus server to server at
 *      /api/media/recording/source (Graph credentials never leave Nexus).
 *   3. Resolve the Range header into a window of at most 4 MB. Always 206.
 *   4. Fetch that window from SharePoint and stream it straight through.
 *   5. On an upstream 403, 404 or 410 (the pre-authenticated URL expired mid
 *      class), evict, re-resolve once with ?evict=1, retry once, then give up.
 *   6. If the upstream ignores Range and answers 200, cancel it and 502, so a
 *      single request can never pull a whole lecture.
 */

import { verifyVideoGrant, type VideoGrantPayload } from './grant';
import {
  resolveByteRange,
  formatContentRange,
  formatUnsatisfiedRange,
  DEFAULT_MAX_CHUNK_BYTES,
} from './range';

export interface MediaEnv {
  /** Must equal Nexus's VIDEO_STREAM_SECRET (or IMPERSONATION_JWT_SECRET if that is unset). */
  VIDEO_TOKEN_SECRET?: string;
  /** Shared with Nexus's MEDIA_PROXY_SECRET; authenticates the source lookup. */
  MEDIA_PROXY_SECRET?: string;
  /** e.g. https://nexus.neramclasses.com, no trailing slash. */
  NEXUS_ORIGIN?: string;
  /** Optional comma separated extra origins for CORS (local dev). */
  EXTRA_ALLOWED_ORIGINS?: string;
  /** Optional override of the 4 MB window, in bytes. */
  MAX_CHUNK_BYTES?: string;
}

/** The subset of the Cache API the handler uses (caches.default satisfies it). */
export interface SourceCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface HandlerDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  cache: SourceCache | null;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface MediaSource {
  downloadUrl: string;
  mime: string;
  size: number;
}

/** 30 minutes. Well inside the roughly one hour a Graph download URL lives. */
export const SOURCE_CACHE_TTL_SECONDS = 30 * 60;

export const SOURCE_PATH = '/api/media/recording/source';

class SourceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function allowedOrigin(request: Request, env: MediaEnv): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = [env.NEXUS_ORIGIN, ...(env.EXTRA_ALLOWED_ORIGINS || '').split(',')]
    .map((o) => (o || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
    Vary: 'Origin',
  };
}

function deny(status: number, error: string, origin: string | null): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

/** Cache key for a source lookup. Uses the Worker's own origin so it is a valid, zone-local URL. */
export function sourceCacheKey(workerOrigin: string, grant: Pick<VideoGrantPayload, 'scope' | 'refId'>): string {
  return `${workerOrigin}/__source/${encodeURIComponent(grant.scope)}/${encodeURIComponent(grant.refId)}`;
}

function isMediaSource(value: unknown): value is MediaSource {
  const v = value as MediaSource;
  return !!v && typeof v.downloadUrl === 'string' && !!v.downloadUrl && typeof v.mime === 'string';
}

async function fetchSourceFromNexus(
  token: string,
  env: MediaEnv,
  deps: HandlerDeps,
  evict: boolean,
): Promise<MediaSource> {
  const origin = (env.NEXUS_ORIGIN || '').replace(/\/+$/, '');
  if (!origin || !env.MEDIA_PROXY_SECRET) throw new SourceError(500, 'media proxy is not configured');

  const url = `${origin}${SOURCE_PATH}?vt=${encodeURIComponent(token)}${evict ? '&evict=1' : ''}`;
  const res = await deps.fetch(url, {
    headers: { 'x-media-proxy-secret': env.MEDIA_PROXY_SECRET, Accept: 'application/json' },
  });
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw new SourceError(res.status, `source lookup failed (${res.status})`);
  }
  const data = await res.json().catch(() => null);
  if (!isMediaSource(data)) throw new SourceError(502, 'source lookup returned no download URL');
  return { downloadUrl: data.downloadUrl, mime: data.mime || 'video/mp4', size: Number(data.size) || 0 };
}

async function readCachedSource(cache: SourceCache | null, key: string): Promise<MediaSource | null> {
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const data = await hit.json().catch(() => null);
    return isMediaSource(data) ? data : null;
  } catch {
    return null;
  }
}

function writeCachedSource(cache: SourceCache | null, key: string, source: MediaSource, deps: HandlerDeps): void {
  if (!cache) return;
  const put = cache
    .put(
      key,
      new Response(JSON.stringify(source), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${SOURCE_CACHE_TTL_SECONDS}`,
        },
      }),
    )
    .catch(() => {});
  if (deps.waitUntil) deps.waitUntil(put);
}

/** Cached source, else a fresh lookup through Nexus. `evict` forces the fresh path on both sides. */
export async function getSource(
  token: string,
  grant: VideoGrantPayload,
  workerOrigin: string,
  env: MediaEnv,
  deps: HandlerDeps,
  evict = false,
): Promise<MediaSource> {
  const key = sourceCacheKey(workerOrigin, grant);
  if (evict) {
    if (deps.cache) await deps.cache.delete(key).catch(() => false);
  } else {
    const cached = await readCachedSource(deps.cache, key);
    if (cached) return cached;
  }
  const source = await fetchSourceFromNexus(token, env, deps, evict);
  writeCachedSource(deps.cache, key, source, deps);
  return source;
}

function fetchWindow(deps: HandlerDeps, downloadUrl: string, start: number, end: number): Promise<Response> {
  return deps.fetch(downloadUrl, { headers: { Range: `bytes=${start}-${end}` } });
}

function sourceErrorResponse(err: unknown, origin: string | null): Response {
  if (err instanceof SourceError) {
    if (err.status === 404) return deny(404, 'That recording is no longer available.', origin);
    if (err.status === 409) return deny(409, 'This recording is not ready to stream yet.', origin);
    console.error('[media-proxy] source lookup failed', err.status, err.message);
    return deny(502, 'Could not read the recording.', origin);
  }
  console.error('[media-proxy] source lookup threw', err instanceof Error ? err.message : err);
  return deny(502, 'Could not read the recording.', origin);
}

export async function handleRequest(request: Request, env: MediaEnv, deps: HandlerDeps): Promise<Response> {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: origin
        ? {
            ...corsHeaders(origin),
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '86400',
          }
        : {},
    });
  }

  if (url.pathname !== '/recording') return deny(404, 'Not found', origin);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const res = deny(405, 'Method not allowed', origin);
    res.headers.set('Allow', 'GET, HEAD, OPTIONS');
    return res;
  }

  const token = url.searchParams.get('vt');
  const grant = await verifyVideoGrant(token, env.VIDEO_TOKEN_SECRET);
  if (!grant || !token) {
    return deny(401, 'This video link has expired. Reload the page to keep watching.', origin);
  }

  let source: MediaSource;
  try {
    source = await getSource(token, grant, url.origin, env, deps);
  } catch (err) {
    return sourceErrorResponse(err, origin);
  }

  // The grant carries the size it was minted with, so a stale cache entry
  // cannot silently change the file out from under an in-flight watch.
  const size = source.size || grant.size;
  if (!size) return deny(409, 'This recording is not ready to stream yet.', origin);

  const maxChunk = Number(env.MAX_CHUNK_BYTES) || DEFAULT_MAX_CHUNK_BYTES;
  const resolution = resolveByteRange(request.headers.get('range'), size, maxChunk);
  if (resolution.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': formatUnsatisfiedRange(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        ...corsHeaders(origin),
      },
    });
  }

  const { range, contentLength } = resolution;
  const headers: Record<string, string> = {
    'Content-Type': source.mime,
    'Content-Length': String(contentLength),
    'Content-Range': formatContentRange(range, size),
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'inline',
    // Same reasoning as the Nexus route: private keeps chunks out of shared
    // caches, immutable lets a student scrub back over watched video for free.
    // The grant in the URL still expires on its own schedule.
    'Cache-Control': 'private, max-age=3600, immutable',
    'X-Content-Type-Options': 'nosniff',
    // same-site, not same-origin: the page is nexus.neramclasses.com and the
    // bytes now come from media.neramclasses.com (same registrable domain).
    'Cross-Origin-Resource-Policy': 'same-site',
    ...corsHeaders(origin),
  };

  // A HEAD answers with the headers the GET would carry, without touching SharePoint.
  if (request.method === 'HEAD') return new Response(null, { status: 206, headers });

  let upstream: Response;
  try {
    upstream = await fetchWindow(deps, source.downloadUrl, range.start, range.end);

    // A pre-authenticated Graph URL outlives its usefulness inside a long class.
    // One re-resolve, then give up.
    if (upstream.status === 403 || upstream.status === 404 || upstream.status === 410) {
      upstream.body?.cancel().catch(() => {});
      try {
        source = await getSource(token, grant, url.origin, env, deps, true);
      } catch (err) {
        return sourceErrorResponse(err, origin);
      }
      upstream = await fetchWindow(deps, source.downloadUrl, range.start, range.end);
    }
  } catch (err) {
    console.error('[media-proxy] upstream fetch threw', err instanceof Error ? err.message : err);
    return deny(502, 'Could not read the recording.', origin);
  }

  if (upstream.status === 200) {
    // The source ignored Range and is sending the whole file. Never pass that on.
    upstream.body?.cancel().catch(() => {});
    console.error('[media-proxy] upstream ignored Range', grant.scope, grant.refId);
    return deny(502, 'The recording source refused a partial request.', origin);
  }

  if (upstream.status !== 206 || !upstream.body) {
    upstream.body?.cancel().catch(() => {});
    console.error('[media-proxy] upstream error', upstream.status, grant.scope, grant.refId);
    return deny(502, 'Could not read the recording.', origin);
  }

  return new Response(upstream.body, { status: 206, headers });
}
