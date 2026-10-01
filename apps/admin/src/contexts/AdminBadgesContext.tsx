'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useVisibilityPolling } from '@neram/ui';
import {
  BADGE_POLL_MS,
  ZERO_BADGES,
  normalizeBadgeCounts,
  shouldRefreshBadges,
  type BadgeCounts,
} from '@/lib/admin-badges';

interface AdminBadgesValue {
  counts: BadgeCounts;
  /** Fetch now (after a mark-read, say). `force` skips the focus/navigation throttle. */
  refresh: (force?: boolean) => void;
  /** Optimistic local change, e.g. the bell zeroing its count on "Mark all read". */
  patch: (partial: Partial<BadgeCounts>) => void;
}

const AdminBadgesContext = createContext<AdminBadgesValue>({
  counts: ZERO_BADGES,
  refresh: () => {},
  patch: () => {},
});

/**
 * The one poller for the sidebar badges and the notification bell.
 *
 * Every two minutes while the tab is visible (useVisibilityPolling pauses it when
 * hidden and catches up on return), plus on window focus and on route change, both
 * throttled to one request per 15 seconds.
 */
export function AdminBadgesProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<BadgeCounts>(ZERO_BADGES);
  const lastFetchedAt = useRef<number | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastFetchedAt.current = Date.now();
    try {
      const res = await fetch('/api/admin-badges', { cache: 'no-store' });
      if (res.ok) setCounts(normalizeBadgeCounts(await res.json()));
    } catch {
      // Keep the previous counts; a badge is not worth an error banner.
    } finally {
      inFlight.current = false;
    }
  }, []);

  const refresh = useCallback(
    (force = false) => {
      if (force || shouldRefreshBadges(lastFetchedAt.current)) void load();
    },
    [load],
  );

  useVisibilityPolling(load, BADGE_POLL_MS);

  // Navigation: the first render is covered by the poller's immediate run.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const patch = useCallback((partial: Partial<BadgeCounts>) => {
    setCounts((prev) => ({ ...prev, ...partial }));
  }, []);

  const value = useMemo(() => ({ counts, refresh, patch }), [counts, refresh, patch]);
  return <AdminBadgesContext.Provider value={value}>{children}</AdminBadgesContext.Provider>;
}

export function useAdminBadges(): AdminBadgesValue {
  return useContext(AdminBadgesContext);
}
