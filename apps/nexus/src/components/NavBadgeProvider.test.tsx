import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

/**
 * The badge poller under a stalled server.
 *
 * Production showed /api/nav-badges hanging until Cloudflare's 100s cut-off (524).
 * The poller had no deadline and no in-flight guard, so each 60s tick stacked
 * another hung request on the last, and an older response could land after a
 * newer one and put a stale count back on screen.
 */

// One stable context object, as the real provider gives. getToken would redirect
// the page on an expired session, so a poller must never reach it (PERF-0054).
const auth = {
  getToken: async () => {
    throw new Error('the redirecting getToken was used by a background poller');
  },
  getTokenSilently: async () => 'token',
  user: { id: 'u1' },
};
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));

import NavBadgeProvider, { useNavBadges } from './NavBadgeProvider';

let ctx: ReturnType<typeof useNavBadges>;
function Probe() {
  ctx = useNavBadges();
  return null;
}

type Pending = { signal?: AbortSignal; resolve: (badges: Record<string, number>) => void };
let pending: Pending[];
const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
  return new Promise<Response>((resolve, reject) => {
    const p: Pending = {
      signal: init?.signal ?? undefined,
      resolve: (badges) => resolve(new Response(JSON.stringify({ badges }), { status: 200 })),
    };
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    pending.push(p);
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  pending = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const mount = async () => {
  render(
    <NavBadgeProvider>
      <Probe />
    </NavBadgeProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('NavBadgeProvider polling', () => {
  it('does not stack a new poll on one that is still hanging', async () => {
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Coming back to the tab polls at once, which used to start a second request
    // alongside the first one still hanging.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up on a hung request so the next poll can run', async () => {
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pending[0].signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never lets an older response overwrite a newer count', async () => {
    await mount();
    // An explicit refresh (a teacher just approved a photo) always goes out.
    await act(async () => {
      ctx.refreshBadges();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending[1].resolve({ photo_review: 2 });
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      pending[0].resolve({ photo_review: 5 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(ctx.getBadgeCount('/teacher/photo-review')).toBe(2);
  });
});
