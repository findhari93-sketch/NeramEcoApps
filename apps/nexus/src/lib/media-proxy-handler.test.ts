// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mintVideoToken } from './video-token';
import {
  handleRequest,
  sourceCacheKey,
  SOURCE_PATH,
  type HandlerDeps,
  type MediaEnv,
  type SourceCache,
} from '../../../../cloudflare/media-proxy/src/handler';

const SECRET = 'handler-test-secret';
const PROXY_SECRET = 'proxy-shared-secret';
const WORKER = 'https://media.example.com';
const NEXUS = 'https://nexus.example.com';
const SIZE = 50_000_000;
const CHUNK = 4 * 1024 * 1024;

const env: MediaEnv = {
  VIDEO_TOKEN_SECRET: SECRET,
  MEDIA_PROXY_SECRET: PROXY_SECRET,
  NEXUS_ORIGIN: NEXUS,
};

class MemoryCache implements SourceCache {
  store = new Map<string, string>();
  async match(key: string) {
    const v = this.store.get(key);
    return v === undefined ? undefined : new Response(v);
  }
  async put(key: string, res: Response) {
    this.store.set(key, await res.text());
  }
  async delete(key: string) {
    return this.store.delete(key);
  }
}

function sourceReply(url = 'https://sp.example.com/dl?tempauth=1') {
  return new Response(JSON.stringify({ downloadUrl: url, mime: 'video/mp4', size: SIZE }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function window206(start: number, end: number) {
  return new Response(new Uint8Array(end - start + 1), {
    status: 206,
    headers: { 'Content-Range': `bytes ${start}-${end}/${SIZE}` },
  });
}

let cache: MemoryCache;
let fetchMock: ReturnType<typeof vi.fn>;
let deps: HandlerDeps;

beforeEach(() => {
  process.env.VIDEO_STREAM_SECRET = SECRET;
  cache = new MemoryCache();
  fetchMock = vi.fn();
  deps = { fetch: fetchMock as unknown as HandlerDeps['fetch'], cache };
});

afterEach(() => {
  delete process.env.VIDEO_STREAM_SECRET;
});

function token(scope: 'recap' | 'class' | 'foundation' = 'recap') {
  return mintVideoToken({ scope, refId: 'r-1', userId: 'u-1', size: SIZE }).token;
}

function req(path: string, init: RequestInit = {}) {
  return new Request(`${WORKER}${path}`, init);
}

describe('media Worker handler', () => {
  it('401s without a valid grant and never calls upstream', async () => {
    const res = await handleRequest(req('/recording?vt=vid_bad.sig'), env, deps);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404s on any other path', async () => {
    const res = await handleRequest(req('/other'), env, deps);
    expect(res.status).toBe(404);
  });

  it('resolves the source through Nexus with the shared secret, then streams a 206', async () => {
    const vt = token();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith(NEXUS)) return sourceReply();
      const range = new Headers(init?.headers).get('Range');
      expect(range).toBe(`bytes=0-${CHUNK - 1}`);
      return window206(0, CHUNK - 1);
    });

    const res = await handleRequest(req(`/recording?vt=${encodeURIComponent(vt)}`, { headers: { Range: 'bytes=0-' } }), env, deps);

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe(`bytes 0-${CHUNK - 1}/${SIZE}`);
    expect(res.headers.get('Content-Length')).toBe(String(CHUNK));
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-site');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600, immutable');

    const [sourceUrl, sourceInit] = fetchMock.mock.calls[0];
    expect(sourceUrl).toBe(`${NEXUS}${SOURCE_PATH}?vt=${encodeURIComponent(vt)}`);
    expect(new Headers(sourceInit.headers).get('x-media-proxy-secret')).toBe(PROXY_SECRET);
  });

  it('uses the cached source on the next request (no second Nexus call)', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.startsWith(NEXUS) ? sourceReply() : window206(0, 9)));
    const vt = encodeURIComponent(token());
    await handleRequest(req(`/recording?vt=${vt}`, { headers: { Range: 'bytes=0-9' } }), env, deps);
    await handleRequest(req(`/recording?vt=${vt}`, { headers: { Range: 'bytes=0-9' } }), env, deps);
    const nexusCalls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith(NEXUS));
    expect(nexusCalls).toHaveLength(1);
    expect(cache.store.has(sourceCacheKey(WORKER, { scope: 'recap', refId: 'r-1' }))).toBe(true);
  });

  it('416s past the end of the file without touching SharePoint', async () => {
    fetchMock.mockImplementation(async () => sourceReply());
    const res = await handleRequest(
      req(`/recording?vt=${encodeURIComponent(token())}`, { headers: { Range: `bytes=${SIZE}-` } }),
      env,
      deps,
    );
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe(`bytes */${SIZE}`);
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).startsWith(NEXUS))).toHaveLength(0);
  });

  it('on an upstream 403, evicts, re-resolves once with evict=1, and retries', async () => {
    let sharepointCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(NEXUS)) {
        return sourceReply(url.includes('evict=1') ? 'https://sp.example.com/fresh' : 'https://sp.example.com/stale');
      }
      sharepointCalls++;
      return url.endsWith('/stale') ? new Response('expired', { status: 403 }) : window206(0, 9);
    });
    const res = await handleRequest(
      req(`/recording?vt=${encodeURIComponent(token())}`, { headers: { Range: 'bytes=0-9' } }),
      env,
      deps,
    );
    expect(res.status).toBe(206);
    expect(sharepointCalls).toBe(2);
    const evictCall = fetchMock.mock.calls.find(([u]) => String(u).includes('evict=1'));
    expect(evictCall).toBeTruthy();
  });

  it('gives up after one retry', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(NEXUS) ? sourceReply() : new Response('gone', { status: 410 }),
    );
    const res = await handleRequest(req(`/recording?vt=${encodeURIComponent(token())}`), env, deps);
    expect(res.status).toBe(502);
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).startsWith(NEXUS))).toHaveLength(2);
  });

  it('502s when SharePoint ignores Range and sends the whole file', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(NEXUS) ? sourceReply() : new Response(new Uint8Array(10), { status: 200 }),
    );
    const res = await handleRequest(req(`/recording?vt=${encodeURIComponent(token())}`), env, deps);
    expect(res.status).toBe(502);
  });

  it('passes a Nexus 404 through as 404', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 404 }));
    const res = await handleRequest(req(`/recording?vt=${encodeURIComponent(token())}`), env, deps);
    expect(res.status).toBe(404);
  });

  it('turns a Nexus 401 (secret mismatch) into a 502, not a student-facing 401', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
    const res = await handleRequest(req(`/recording?vt=${encodeURIComponent(token())}`), env, deps);
    expect(res.status).toBe(502);
  });

  it('answers HEAD with the GET headers and no SharePoint call', async () => {
    fetchMock.mockImplementation(async () => sourceReply());
    const res = await handleRequest(req(`/recording?vt=${encodeURIComponent(token())}`, { method: 'HEAD' }), env, deps);
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Length')).toBe(String(CHUNK));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects other methods', async () => {
    const res = await handleRequest(req(`/recording?vt=x`, { method: 'POST' }), env, deps);
    expect(res.status).toBe(405);
  });

  it('answers a preflight from Nexus with CORS, and from anyone else without', async () => {
    const ok = await handleRequest(req('/recording', { method: 'OPTIONS', headers: { Origin: NEXUS } }), env, deps);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(NEXUS);
    const other = await handleRequest(req('/recording', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env, deps);
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
