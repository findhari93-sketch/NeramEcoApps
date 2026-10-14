import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useWatchSession, FLUSH_INTERVAL_MS, __resetWatchSessionCache } from './useWatchSession';

/**
 * The heartbeat that used to lose watching. It sent deltas and forgot each one
 * on send, so a failed request (weak connection, a sign-in token that would not
 * refresh) erased real playback, and a reload rebuilt coverage from what was
 * left. Inaya watched one section about four times and was credited for less
 * than one. These pin the replacement: cumulative totals, resent until a
 * request lands, and never cleared.
 */

const ENDPOINT = '/api/student/class-recaps/r1/progress';

function stubFetch(statuses: number[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const status = statuses.length ? statuses.shift()! : 200;
    return new Response('{}', { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const bodies = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function mount(endpoint: string | null = ENDPOINT, enabled = true) {
  const getToken = vi.fn(async () => 'tok');
  const hook = renderHook(() => useWatchSession({ endpoint, getToken, enabled }));
  return { ...hook, getToken };
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetWatchSessionCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useWatchSession', () => {
  it('sends cumulative totals and played ranges, version 2', async () => {
    const fetchMock = stubFetch([]);
    const { result } = mount();
    await settle();

    act(() => {
      result.current.playerProps.onTimeUpdate(3526, 4383);
      result.current.playerProps.onPlayedSpan(3496, 3526);
    });
    await settle(FLUSH_INTERVAL_MS);

    const [body] = bodies(fetchMock);
    expect(body).toMatchObject({
      v: 2,
      last_video_position_seconds: 3526,
      duration_seconds: 4383,
      watched_seconds: 30,
      played_ranges: [[3496, 3526]],
      blocked_total: 0,
    });
    expect(body.session_id).toMatch(/^[A-Za-z0-9_-]{6,}$/);
  });

  it('loses nothing when requests fail: the next one carries all of it', async () => {
    const fetchMock = stubFetch([500, 500]);
    const { result } = mount();
    await settle();

    act(() => result.current.playerProps.onPlayedSpan(0, 30));
    await settle(FLUSH_INTERVAL_MS);
    act(() => result.current.playerProps.onPlayedSpan(30, 60));
    await settle(FLUSH_INTERVAL_MS);
    act(() => result.current.playerProps.onPlayedSpan(60, 90));
    await settle(FLUSH_INTERVAL_MS);

    const sent = bodies(fetchMock);
    expect(sent).toHaveLength(3);
    expect(sent[2]).toMatchObject({ watched_seconds: 90, played_ranges: [[0, 90]] });
  });

  it('counts rewatching as watch time, without inventing coverage', async () => {
    const fetchMock = stubFetch([]);
    const { result } = mount();
    await settle();
    act(() => {
      result.current.playerProps.onPlayedSpan(100, 160);
      result.current.playerProps.onPlayedSpan(100, 160);
    });
    await settle(FLUSH_INTERVAL_MS);
    expect(bodies(fetchMock)[0]).toMatchObject({ watched_seconds: 120, played_ranges: [[100, 160]] });
  });

  it('keeps sending until a request lands, then stays quiet while nothing changes', async () => {
    const fetchMock = stubFetch([500]);
    const { result } = mount();
    await settle();
    act(() => result.current.playerProps.onPlayedSpan(0, 10));
    await settle(FLUSH_INTERVAL_MS);
    await settle(FLUSH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await settle(FLUSH_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('carries stalls, reloads, grant refreshes, discarded jumps and refused seeks', async () => {
    const fetchMock = stubFetch([]);
    const { result } = mount();
    await settle();
    act(() => {
      const p = result.current.playerProps;
      p.onPlaybackEvent({ type: 'stall', seconds: 41 });
      p.onPlaybackEvent({ type: 'stall', seconds: 3 });
      p.onPlaybackEvent({ type: 'reload' });
      p.onPlaybackEvent({ type: 'grant_refresh', ok: true });
      p.onPlaybackEvent({ type: 'grant_refresh', ok: false });
      p.onPlaybackEvent({ type: 'discarded', seconds: 10 });
      p.onBlockedSeek();
    });
    await settle(FLUSH_INTERVAL_MS);
    expect(bodies(fetchMock)[0]).toMatchObject({
      blocked_total: 1,
      diagnostics: {
        stalls: 2,
        stall_seconds: 44,
        reloads: 1,
        grant_refreshes: 2,
        grant_refresh_failures: 1,
        discarded_seconds: 10,
      },
    });
  });

  it('seeds from stored ranges, or from the older played_until', () => {
    stubFetch([]);
    const a = mount('/a');
    act(() => a.result.current.seedFromEmbed({ played_ranges: [[0, 100], [200, 250]], played_until: 100 }));
    expect(a.result.current.ranges).toEqual([[0, 100], [200, 250]]);

    const b = mount('/b');
    act(() => b.result.current.seedFromEmbed({ played_until: 3496, resume_at: 3546 }));
    expect(b.result.current.ranges).toEqual([[0, 3496]]);
  });

  it('remembers this tab’s watching across a remount, before the server answers', async () => {
    stubFetch([]);
    const first = mount();
    act(() => first.result.current.playerProps.onPlayedSpan(10, 70));
    first.unmount();
    const second = mount();
    expect(second.result.current.ranges).toEqual([[10, 70]]);
  });

  it('flushes with keepalive on unmount, reusing the last token', async () => {
    const fetchMock = stubFetch([]);
    const { result, unmount } = mount();
    await settle();
    act(() => result.current.playerProps.onPlayedSpan(0, 5));
    unmount();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('saves nothing while disabled, but still grows the ranges for the gate', async () => {
    const fetchMock = stubFetch([]);
    const { result } = mount(ENDPOINT, false);
    await settle();
    act(() => result.current.playerProps.onPlayedSpan(0, 30));
    await settle(FLUSH_INTERVAL_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.ranges).toEqual([[0, 30]]);
  });
});
