// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { __resetHintThrottle, broadcastHint } from './realtime';

const SERVICE_KEY = 'service-role-secret-value';
let fetchSpy: Mock;

beforeEach(() => {
  __resetHintThrottle();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db-staging.example.com/');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY);
  fetchSpy = vi.fn(async () => ({ ok: true, status: 202 }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function sentBody(call = 0) {
  const [, init] = fetchSpy.mock.calls[call] as [string, RequestInit];
  return JSON.parse(init.body as string) as { messages: Array<{ topic: string; event: string; payload: Record<string, unknown> }> };
}

describe('broadcastHint', () => {
  it('posts one hint per distinct topic to the REST broadcast endpoint with the service key', async () => {
    await expect(broadcastHint(['pad-a', 'padt-b', 'pad-a', ''], { now: 1234 })).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://db-staging.example.com/realtime/v1/api/broadcast');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' });
    expect(sentBody().messages).toEqual([
      { topic: 'pad-a', event: 'hint', payload: { v: 1234 } },
      { topic: 'padt-b', event: 'hint', payload: { v: 1234 } },
    ]);
  });

  it('never puts anything but a timestamp in the payload', async () => {
    await broadcastHint(['pad-a']);
    for (const message of sentBody().messages) {
      expect(Object.keys(message.payload)).toEqual(['v']);
      expect(typeof message.payload.v).toBe('number');
    }
  });

  it('does nothing without topics or without the server configuration', async () => {
    await expect(broadcastHint([])).resolves.toBe(false);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(broadcastHint(['pad-a'])).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a refused hint without throwing, and never logs the key', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(broadcastHint(['pad-a'])).resolves.toBe(false);

    fetchSpy.mockRejectedValueOnce(new TypeError(`fetch failed for ${SERVICE_KEY}`));
    await expect(broadcastHint(['pad-b'])).resolves.toBe(false);

    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('403');
    expect(logged).not.toContain(SERVICE_KEY);
  });

  it('gives up after a second and a half instead of holding the request', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const pending = broadcastHint(['pad-a']);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('AbortError'));
  });

  it('throttles a burst on the same topic but not other topics, then sends again once the window passes', async () => {
    await expect(broadcastHint(['padt-a'], { throttleMs: 1_000, now: 10_000 })).resolves.toBe(true);
    await expect(broadcastHint(['padt-a'], { throttleMs: 1_000, now: 10_400 })).resolves.toBe(false);
    await expect(broadcastHint(['padt-b'], { throttleMs: 1_000, now: 10_500 })).resolves.toBe(true);
    await expect(broadcastHint(['padt-a'], { throttleMs: 1_000, now: 11_000 })).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Teacher transitions are never throttled.
    await expect(broadcastHint(['padt-a'], { now: 11_001 })).resolves.toBe(true);
  });
});
