import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deadlineFetch, SUPABASE_REST_DEADLINE_MS } from './fetch-deadline';

/**
 * Server-side Supabase calls must not hang for as long as the platform allows.
 *
 * Every Nexus server query goes function -> db.neramclasses.com Worker ->
 * supabase.co, and none of those hops had a deadline. A stalled hop held the
 * route open until Cloudflare's 100s cut-off (a 524). The slowest statement
 * production has ever run through the service role took 3.2s, so PostgREST and
 * auth calls get a 20s deadline; storage uploads keep none, because a large file
 * legitimately takes longer.
 */

type Captured = { url: string; init: RequestInit };
let calls: Captured[];

/** A fetch that never answers unless aborted, like a stalled proxy hop. */
const hangingFetch = vi.fn((url: RequestInfo | URL, init: RequestInit = {}) => {
  calls.push({ url: String(url), init });
  return new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  hangingFetch.mockClear();
  vi.stubGlobal('fetch', hangingFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('deadlineFetch', () => {
  it('abandons a PostgREST call that never answers, with a message that says so', async () => {
    const settled = expect(deadlineFetch('https://db.example.com/rest/v1/users?select=id', {})).rejects.toThrow(
      /Supabase request timed out after 20000ms/,
    );
    await vi.advanceTimersByTimeAsync(SUPABASE_REST_DEADLINE_MS);
    await settled;
  });

  it('applies the same deadline to RPCs and auth admin calls', async () => {
    const rpc = expect(deadlineFetch('https://db.example.com/rest/v1/rpc/nexus_issue_badge_counts', {})).rejects.toThrow(/timed out/);
    const auth = expect(deadlineFetch('https://db.example.com/auth/v1/admin/users', {})).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(SUPABASE_REST_DEADLINE_MS);
    await rpc;
    await auth;
  });

  it('leaves storage uploads without a deadline', async () => {
    void deadlineFetch('https://db.example.com/storage/v1/object/drawings/a.png', { method: 'POST' });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0].init.signal).toBeUndefined();
  });

  it('still honours a caller abort signal', async () => {
    const caller = new AbortController();
    const settled = expect(deadlineFetch('https://db.example.com/rest/v1/users', { signal: caller.signal })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    await settled;
  });

  it('bypasses the Next.js fetch cache, as the admin client always has', async () => {
    void deadlineFetch('https://db.example.com/rest/v1/users', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0].init.cache).toBe('no-store');
  });

  it('passes answers through untouched and clears its timer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    const res = await deadlineFetch('https://db.example.com/rest/v1/users', {});
    expect(res.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});
