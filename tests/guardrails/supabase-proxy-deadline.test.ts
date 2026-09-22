// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`. The Worker only needs Request, Response, fetch and timers.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../../cloudflare/supabase-proxy/src/index';

/**
 * Guardrail for the Supabase proxy Worker's upstream deadline.
 *
 * Every server query from the apps, and every browser query, goes through
 * db.neramclasses.com to supabase.co. The Worker's upstream fetch had no
 * deadline, so a stalled supabase.co answer held the caller open for as long as
 * the platform allowed (Nexus saw 524s). The Worker now gives up at 25s, just
 * after the apps' own 20s client deadline (packages/database/src/fetch-deadline.ts),
 * so the app's clearer error normally wins. Storage keeps no deadline.
 */

const env = { SUPABASE_HOST: 'project.supabase.co' };
let upstream: RequestInit[];

beforeEach(() => {
  vi.useFakeTimers();
  upstream = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string, init?: RequestInit) => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      upstream.push({ signal });
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const call = (path: string, method = 'GET') =>
  worker.fetch(
    new Request(`https://db.neramclasses.com${path}`, {
      method,
      headers: { Origin: 'https://nexus.neramclasses.com', Authorization: 'Bearer anon' },
    }),
    env,
  );

describe('supabase proxy upstream deadline', () => {
  it('answers 504 when supabase.co does not answer within the deadline', async () => {
    const pending = call('/rest/v1/users?select=id');
    await vi.advanceTimersByTimeAsync(25_000);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ error: 'Upstream timeout' });
    // CORS headers still present, so the browser can read the error.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://nexus.neramclasses.com');
  });

  it('leaves storage uploads without a deadline', async () => {
    void call('/storage/v1/object/drawings/a.png', 'GET');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].signal?.aborted ?? false).toBe(false);
  });
});
