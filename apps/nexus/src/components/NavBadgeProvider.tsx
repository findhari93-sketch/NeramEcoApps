'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/** Map of nav path suffixes to badge counts */
type BadgeCounts = Record<string, number>;

interface NavBadgeContextValue {
  /** Get the badge count for a navigation path (e.g. '/student/issues' or '/teacher/issues') */
  getBadgeCount: (path: string) => number;
}

const NavBadgeContext = createContext<NavBadgeContextValue>({
  getBadgeCount: () => 0,
});

export function useNavBadges() {
  return useContext(NavBadgeContext);
}

/** Path suffix → badge key mapping */
const PATH_TO_BADGE_KEY: Record<string, string> = {
  '/student/issues': 'issues',
  '/teacher/issues': 'issues',
  '/teacher/onboarding-reviews': 'onboarding',
  '/teacher/drawing-reviews': 'drawing_reviews',
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

  // Fetch on mount and poll
  useEffect(() => {
    if (!user) return;

    fetchBadges();
    intervalRef.current = setInterval(fetchBadges, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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

  const value = useMemo(() => ({ getBadgeCount }), [getBadgeCount]);

  return (
    <NavBadgeContext.Provider value={value}>
      {children}
    </NavBadgeContext.Provider>
  );
}
