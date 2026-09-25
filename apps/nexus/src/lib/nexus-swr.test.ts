/**
 * The fetcher underneath the class panel's cache.
 *
 * Only the non-React half is tested here: the hooks need a renderer this app's
 * unit setup does not carry, and the two things that can actually go wrong are
 * both in plain functions. A fetcher that resolves instead of throwing on a 500
 * would make every section render its empty state on an outage, which is how a
 * teacher comes to believe a class has no assignments. And a class matcher that
 * is too greedy would drop half the cache on every save.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithToken, NexusFetchError, FETCH_DEADLINE_MS } from './nexus-swr';

const token = async () => 'tok-1';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch(res: { ok: boolean; status?: number; body?: unknown }) {
  // The parameters are declared even though the stub ignores them: without them
  // the recorded call is typed as an empty tuple and reading `calls[0][1]` to
  // assert on the headers stops compiling.
  const spy = vi.fn(async (_url: string, _init?: { headers: Record<string, string>; signal?: AbortSignal }) => ({
    ok: res.ok,
    status: res.status ?? (res.ok ? 200 : 500),
    json: async () => res.body ?? {},
  }));
  vi.stubGlobal('fetch', spy as any);
  return spy;
}

describe('fetchWithToken', () => {
  it('sends the bearer token the Nexus routes require', async () => {
    const spy = stubFetch({ ok: true, body: { rows: [] } });
    await fetchWithToken('/api/timetable/c1/prep-roster', token);
    expect(spy).toHaveBeenCalledWith(
      '/api/timetable/c1/prep-roster',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok-1' } }),
    );
  });

  it('sends no Authorization header when there is no token yet', async () => {
    // Better than an "Authorization: Bearer null" the route would have to parse.
    const spy = stubFetch({ ok: true, body: {} });
    await fetchWithToken('/api/timetable/c1/resources', async () => null);
    expect(spy.mock.calls[0][1]?.headers).toEqual({});
  });

  it('returns the parsed body on success', async () => {
    stubFetch({ ok: true, body: { assignments: [{ id: 'a1' }] } });
    const data = await fetchWithToken<{ assignments: { id: string }[] }>('/x', token);
    expect(data.assignments[0].id).toBe('a1');
  });

  it('throws on a non-2xx rather than resolving to an empty shape', async () => {
    // The load-bearing one. SWR tells "errored" from "resolved to nothing" only
    // by the throw, so swallowing this makes an outage look like empty data.
    stubFetch({ ok: false, status: 500, body: { error: 'boom' } });
    await expect(fetchWithToken('/x', token)).rejects.toThrow('boom');
  });

  it('carries the status, so a caller can tell 404 from 500', async () => {
    stubFetch({ ok: false, status: 404, body: {} });
    await expect(fetchWithToken('/x', token)).rejects.toMatchObject({
      status: 404,
      name: 'NexusFetchError',
    });
  });

  it('still throws when the error body is not json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      })) as any,
    );
    const err = await fetchWithToken('/x', token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NexusFetchError);
    expect((err as NexusFetchError).message).toContain('502');
  });

  /**
   * 2026-09-24, prod: the catch-up drawer's Attended tab sat on skeletons. SWR's
   * isLoading stays true for as long as the fetcher is pending, so a token call or
   * a request that never settles meant a skeleton for good, with no error for the
   * tab to show and nothing to retry. A deadline turns a hang into an error.
   */
  it('gives up on a request that never answers, so the caller can show an error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ) as any,
    );
    const pending = fetchWithToken('/x', token).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(FETCH_DEADLINE_MS);
    const err = await pending;
    expect(err).toBeInstanceOf(NexusFetchError);
    expect((err as NexusFetchError).status).toBe(408);
  });

  it('gives up on a token call that never settles, without sending the request', async () => {
    vi.useFakeTimers();
    const spy = stubFetch({ ok: true, body: {} });
    const pending = fetchWithToken('/x', () => new Promise<string | null>(() => {})).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(FETCH_DEADLINE_MS);
    const err = await pending;
    expect((err as NexusFetchError).status).toBe(408);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not time out a request that answers in time', async () => {
    vi.useFakeTimers();
    stubFetch({ ok: true, body: { ok: 1 } });
    await expect(fetchWithToken('/x', token)).resolves.toEqual({ ok: 1 });
    // The timer is cleared, so nothing fires later against a finished request.
    expect(vi.getTimerCount()).toBe(0);
  });
});
