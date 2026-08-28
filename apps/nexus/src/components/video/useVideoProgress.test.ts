import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVideoProgress } from './useVideoProgress';

/**
 * Regression coverage for NXS-0119: a token captured once at mount and handed
 * to this hook meant every heartbeat after the Microsoft token's ~60-90 minute
 * lifetime failed silently for the rest of a long class, because the hook
 * never inspected the fetch response. The fix fetches a fresh token on every
 * periodic/explicit flush; these tests pin that behaviour and the one
 * deliberate exception (the keepalive/unload flush, which must not await a
 * token lookup that might never resolve before the page tears down).
 */

function mockFetchOk() {
  return vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    json: async () => ({ ok: true }),
  }));
}

function authHeader(fetchSpy: ReturnType<typeof mockFetchOk>, callIndex = 0): string | undefined {
  const init = fetchSpy.mock.calls[callIndex]?.[1];
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.Authorization;
}

describe('useVideoProgress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches a fresh token on each periodic flush, not the one from mount', async () => {
    vi.useFakeTimers();
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);

    let n = 0;
    const getToken = vi.fn(async () => `token-${n++}`);

    const { result } = renderHook(() =>
      useVideoProgress({ endpoint: '/api/test/progress', getToken, enabled: true }),
    );

    // Let the mount-time seed effect resolve before we start counting.
    await act(async () => {
      await Promise.resolve();
    });
    fetchSpy.mockClear();

    act(() => result.current.onTick(5, 100));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    act(() => result.current.onTick(20, 100));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstToken = authHeader(fetchSpy, 0);
    const secondToken = authHeader(fetchSpy, 1);
    expect(firstToken).toBeDefined();
    expect(secondToken).toBeDefined();
    expect(secondToken).not.toBe(firstToken);
  });

  it('does not call getToken again on a periodic tick with nothing pending', async () => {
    vi.useFakeTimers();
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);
    const getToken = vi.fn(async () => 'seed-token');

    renderHook(() => useVideoProgress({ endpoint: '/api/test/progress', getToken, enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });
    getToken.mockClear();

    // No onTick() call: the accumulator has nothing pending.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(getToken).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getToken resolving null is a safe no-op, not a crash', async () => {
    vi.useFakeTimers();
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);
    const getToken = vi.fn(async () => null);

    const { result } = renderHook(() =>
      useVideoProgress({ endpoint: '/api/test/progress', getToken, enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    fetchSpy.mockClear();

    act(() => result.current.onTick(5, 100));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the keepalive/unload flush uses the last-seeded token synchronously, without awaiting getToken()', async () => {
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);

    let calls = 0;
    const getToken = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.resolve('seed-token');
      // Simulates a lookup that never resolves before the page tears down.
      // The keepalive path must not be waiting on this.
      return new Promise<string | null>(() => {});
    });

    const { result } = renderHook(() =>
      useVideoProgress({ endpoint: '/api/test/progress', getToken, enabled: true }),
    );

    // Flush the mount-time seed effect so lastTokenRef holds 'seed-token'.
    await act(async () => {
      await Promise.resolve();
    });
    fetchSpy.mockClear();

    act(() => result.current.onTick(5, 100));

    // Fires pagehide synchronously and asserts fetch happened before any
    // await, which would be impossible if the keepalive path were awaiting
    // the never-resolving getToken() promise from a second call.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(authHeader(fetchSpy, 0)).toBe('Bearer seed-token');
    // Only the mount-time seed call happened; the keepalive path never calls
    // getToken() itself.
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('flushNow() is a no-op while disabled', async () => {
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);
    const getToken = vi.fn(async () => 'token');

    const { result } = renderHook(() =>
      useVideoProgress({ endpoint: '/api/test/progress', getToken, enabled: false }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    fetchSpy.mockClear();

    act(() => result.current.onTick(5, 100));
    await act(async () => {
      result.current.flushNow();
      await Promise.resolve();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
