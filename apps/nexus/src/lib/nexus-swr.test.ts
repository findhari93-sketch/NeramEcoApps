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
import { fetchWithToken, NexusFetchError } from './nexus-swr';

const token = async () => 'tok-1';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(res: { ok: boolean; status?: number; body?: unknown }) {
  // The parameters are declared even though the stub ignores them: without them
  // the recorded call is typed as an empty tuple and reading `calls[0][1]` to
  // assert on the headers stops compiling.
  const spy = vi.fn(async (_url: string, _init?: { headers: Record<string, string> }) => ({
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
    expect(spy).toHaveBeenCalledWith('/api/timetable/c1/prep-roster', {
      headers: { Authorization: 'Bearer tok-1' },
    });
  });

  it('sends no Authorization header when there is no token yet', async () => {
    // Better than an "Authorization: Bearer null" the route would have to parse.
    const spy = stubFetch({ ok: true, body: {} });
    await fetchWithToken('/api/timetable/c1/resources', async () => null);
    expect(spy.mock.calls[0][1]).toEqual({ headers: {} });
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
});
