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

let pathname = '/teacher/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import NavBadgeProvider, { useNavBadges } from './NavBadgeProvider';

let ctx: ReturnType<typeof useNavBadges>;
function Probe() {
  ctx = useNavBadges();
  return null;
}

type Pending = { signal?: AbortSignal; resolve: (badges: Record<string, number>) => void };
let pending: Pending[];
/** What a request to any route other than /api/nav-badges answers with. */
let otherStatus = 200;
const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (!String(url).startsWith('/api/nav-badges')) {
    return Promise.resolve(new Response('{}', { status: otherStatus }));
  }
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
  otherStatus = 200;
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
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(pending[0].signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never lets an older response overwrite a newer count', async () => {
    await mount();
    // An explicit refresh (a teacher just approved a photo) always goes out.
    await act(async () => {
      ctx.refreshBadges();
      await vi.advanceTimersByTimeAsync(300);
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
  it('polls every two minutes, not every minute', async () => {
    await mount();
    await act(async () => {
      pending[0].resolve({});
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes on a route change once the counts are stale, not on every click', async () => {
    pathname = '/teacher/dashboard';
    const view = render(
      <NavBadgeProvider>
        <Probe />
      </NavBadgeProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      pending[0].resolve({});
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A quick navigation right after a fetch: counts are fresh, no request.
    pathname = '/teacher/students';
    view.rerender(
      <NavBadgeProvider>
        <Probe />
      </NavBadgeProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    pathname = '/teacher/issues';
    view.rerender(
      <NavBadgeProvider>
        <Probe />
      </NavBadgeProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pathname = '/teacher/dashboard';
  });

  it('refreshes on window focus once the counts are stale', async () => {
    await mount();
    await act(async () => {
      pending[0].resolve({});
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/**
 * The sidebar kept a 3 on Issues after the last ticket was closed: the page
 * never called refreshBadges(), and nothing else refreshed for two minutes.
 * The provider now refreshes after any successful badge-changing request.
 */
describe('NavBadgeProvider refresh after an action', () => {
  const badgeCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/nav-badges')).length;

  const settled = async () => {
    await mount();
    await act(async () => {
      pending[0].resolve({ issues: 3 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(badgeCalls()).toBe(1);
  };

  const request = async (url: string, init?: RequestInit) => {
    await act(async () => {
      await window.fetch(url, init);
      await vi.advanceTimersByTimeAsync(300);
    });
  };

  it('closing a ticket refreshes the badge once', async () => {
    await settled();
    await request('/api/foundation/issues/abc', { method: 'PATCH' });
    expect(badgeCalls()).toBe(2);
    await act(async () => {
      pending[1].resolve({ issues: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(ctx.getBadgeCount('/teacher/issues')).toBe(0);
  });

  it('opening a ticket (the seen=1 read) refreshes the badge', async () => {
    await settled();
    await request('/api/foundation/issues/abc?seen=1');
    expect(badgeCalls()).toBe(2);
  });

  it('a refused action does not refresh', async () => {
    await settled();
    otherStatus = 409;
    await request('/api/foundation/issues/abc', { method: 'PATCH' });
    expect(badgeCalls()).toBe(1);
  });

  it('a request that cannot move a badge does not refresh', async () => {
    await settled();
    await request('/api/exams/e1/answers', { method: 'POST' });
    await request('/api/foundation/issues');
    expect(badgeCalls()).toBe(1);
  });

  it('a page calling refreshBadges() beside the automatic refresh costs one request', async () => {
    await settled();
    await act(async () => {
      await window.fetch('/api/photo-review', { method: 'POST' });
      ctx.refreshBadges();
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(badgeCalls()).toBe(2);
  });

  it('a burst of actions costs one request', async () => {
    await settled();
    await act(async () => {
      for (let i = 0; i < 5; i++) await window.fetch(`/api/photo-review?i=${i}`, { method: 'POST' });
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(badgeCalls()).toBe(2);
  });

  it('unwraps fetch on unmount', async () => {
    await settled();
    cleanup();
    expect(window.fetch).toBe(fetchMock);
  });
});
