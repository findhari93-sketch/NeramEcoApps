'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/** Map of nav path suffixes to badge counts */
type BadgeCounts = Record<string, number>;

interface NavBadgeContextValue {
  /** Get the badge count for a navigation path (e.g. '/student/issues' or '/teacher/issues') */
  getBadgeCount: (path: string) => number;
  /** Force refresh badge counts immediately (call after actions that change counts) */
  refreshBadges: () => void;
}

const NavBadgeContext = createContext<NavBadgeContextValue>({
  getBadgeCount: () => 0,
  refreshBadges: () => {},
});

export function useNavBadges() {
  return useContext(NavBadgeContext);
}

/** Path suffix → badge key mapping */
const PATH_TO_BADGE_KEY: Record<string, string> = {
  '/student/issues': 'issues',
  '/teacher/issues': 'issues',
  '/teacher/drawing-reviews': 'drawing_reviews',
  '/teacher/photo-review': 'photo_review',
  '/teacher/catch-up': 'catchup',
  // The student's own count, not the staff one. Both read `catchup` because the
  // route answers for whoever is asking, and a student never sees a staff path.
  //
  // It matters more here than most badges: Catch-up lives in the "More" sheet,
  // and in the Study Zone it is not in the navigation at all. Without a number
  // rolled up onto More (and onto the zone pill), owed work is invisible until
  // a student goes looking for it.
  '/student/catch-up': 'catchup',
};

const POLL_INTERVAL = 60_000; // 60 seconds

export default function NavBadgeProvider({ children }: { children: React.ReactNode }) {
  const { getToken, user } = useNexusAuthContext();
  const [counts, setCounts] = useState<BadgeCounts>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBadges = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/nav-badges', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setCounts(data.badges || {});
      }
    } catch {
      // Silently fail — badges are non-critical
    }
  }, [getToken]);

  // Fetch on mount and poll, but only while somebody is actually looking.
  //
  // This provider is mounted in both the teacher and student layouts, so an unguarded
  // interval means every signed-in person costs a round of database counts every minute
  // for as long as the tab exists, including the tab left open in the background since
  // Tuesday. Pausing on hidden and catching up on return keeps the badge just as fresh
  // to the person reading it, and stops billing for the ones who are not.
  useEffect(() => {
    if (!user) return;

    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(fetchBadges, POLL_INTERVAL);
    };

    const stop = () => {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      // Refetch immediately on return: the counts may have moved while away, and
      // waiting out the rest of the interval would show a stale badge at the exact
      // moment someone is looking at it.
      fetchBadges();
      start();
    };

    if (document.visibilityState !== 'hidden') {
      fetchBadges();
      start();
    }

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, fetchBadges]);

  const getBadgeCount = useCallback(
    (path: string): number => {
      const key = PATH_TO_BADGE_KEY[path];
      if (!key) return 0;
      return counts[key] || 0;
    },
    [counts],
  );

  const value = useMemo(() => ({ getBadgeCount, refreshBadges: fetchBadges }), [getBadgeCount, fetchBadges]);

  return (
    <NavBadgeContext.Provider value={value}>
      {children}
    </NavBadgeContext.Provider>
  );
}
