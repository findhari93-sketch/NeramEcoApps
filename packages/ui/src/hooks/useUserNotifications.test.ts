import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useUserNotifications } from './useUserNotifications';

/**
 * The shared bell poller under a stalled server.
 *
 * Its in-flight guard stops overlapping polls, but with no deadline one hung
 * request held that guard for as long as the platform kept the connection open
 * (up to Cloudflare's 100s, a 524 in Nexus), so the bell stopped updating.
 */

let seq = 0;
let signals: (AbortSignal | undefined)[];

beforeEach(() => {
  vi.useFakeTimers();
  signals = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useUserNotifications polling', () => {
  it('abandons a hung count request so the next poll can run', async () => {
    // A unique base URL per test: pollers are shared per URL at module level.
    const apiBaseUrl = `https://app-${++seq}.example.com`;
    renderHook(() => useUserNotifications({ apiBaseUrl, getIdToken: async () => 'token' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(signals).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(signals[0]?.aborted).toBe(true);
    expect(signals).toHaveLength(2);
  });
});
