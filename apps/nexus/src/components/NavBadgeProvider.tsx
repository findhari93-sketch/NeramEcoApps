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
  '/teacher/assignments': 'assignment_drawings',
  '/teacher/exams': 'test_drawings',
  '/teacher/sketchbook': 'sketchbook_inbox',
  '/teacher/photo-review': 'photo_review',
  '/teacher/catch-up': 'catchup',
  // Questions a student reported a mistake in. On the folder itself, which is
  // what an icons-only sidebar and the bottom bar show; the Reports queue is
  // one tap from the page it opens.
  '/teacher/question-bank': 'qb_reports',
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
/**
 * A badge request that has not answered in this long is abandoned. Behind Cloudflare
 * a stalled request otherwise hangs until the 100s cut-off (a 524), longer than the
 * poll interval, and holds the in-flight guard below for all of it.
 */
const REQUEST_TIMEOUT = 15_000;

export default function NavBadgeProvider({ children }: { children: React.ReactNode }) {
  // Silent: this polls on a timer, and the redirecting getToken would send the
  // page to Microsoft sign-in under the user when the session expires (PERF-0054).
  const { getTokenSilently: getToken, user } = useNexusAuthContext();
  const [counts, setCounts] = useState<BadgeCounts>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Requests still waiting for an answer. Timed polls skip while any is. */
  const inFlightRef = useRef(0);
  /** Numbers each request, so an older answer landing late cannot overwrite a newer one. */
  const latestRequestRef = useRef(0);

  const fetchBadges = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    inFlightRef.current += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const token = await getToken();
      if (!token) return;

      // cache: 'no-store' as defence in depth. The route already answers
      // no-store, and it is the only consumer, but this fetch is what the bug
      // actually went through: refreshBadges() is called the instant a teacher
      // approves a photo, and with no cache option the browser happily replayed
      // a body it had held for under 30 seconds and re-set the stale number.
      // Belt and braces against a future intermediary putting the trap back.
      const res = await fetch('/api/nav-badges', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (requestId === latestRequestRef.current) setCounts(data.badges || {});
        return;
      }
      // Not fatal, the next poll retries. But log it: a non-OK response leaves
      // the previous counts on screen looking authoritative, and a badge that
      // is quietly frozen is exactly the failure this provider already had.
      console.warn('nav-badges: refusing to update counts, server said', res.status);
    } catch (err) {
      // Badges are non-critical, so this must not throw. It must not be silent
      // either: the counts on screen are now of unknown age.
      console.warn('nav-badges: could not refresh counts', err);
    } finally {
      clearTimeout(timer);
      inFlightRef.current -= 1;
    }
  }, [getToken]);

  /**
   * The timed and on-return polls. They skip while a request is still out, so a slow
   * server gets one request at a time from each tab instead of a growing pile.
   * refreshBadges() (after a teacher acts) is never skipped: it calls fetchBadges.
   */
  const pollBadges = useCallback(() => {
    if (inFlightRef.current > 0) return;
    void fetchBadges();
  }, [fetchBadges]);

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
      intervalRef.current = setInterval(pollBadges, POLL_INTERVAL);
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
      pollBadges();
      start();
    };

    if (document.visibilityState !== 'hidden') {
      pollBadges();
      start();
    }

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, pollBadges]);

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
