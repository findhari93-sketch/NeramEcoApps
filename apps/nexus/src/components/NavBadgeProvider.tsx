'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { affectsBadges, describeFetch } from '@/lib/badge-mutations';

/** Map of nav path suffixes to badge counts */
type BadgeCounts = Record<string, number>;

interface NavBadgeContextValue {
  /** Get the badge count for a navigation path (e.g. '/student/issues' or '/teacher/issues') */
  getBadgeCount: (path: string) => number;
  /**
   * Refresh badge counts now (after a short debounce). Rarely needed: a successful
   * request to any route in lib/badge-mutations.ts already triggers this.
   */
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
export const PATH_TO_BADGE_KEY: Record<string, string> = {
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

/**
 * Two minutes. Was one; the catch-ups below (tab shown again, window focus,
 * moving to another page) are what keep the badge current for someone who is
 * actually using Nexus, so the timer only has to cover a page left open.
 */
const POLL_INTERVAL = 120_000;
/** Focus and navigation only fetch when the counts on screen are at least this old. */
const STALE_AFTER = 30_000;
/**
 * A badge request that has not answered in this long is abandoned. Behind Cloudflare
 * a stalled request otherwise hangs until the 100s cut-off (a 524), longer than the
 * poll interval, and holds the in-flight guard below for all of it.
 */
const REQUEST_TIMEOUT = 15_000;
/**
 * How long a refresh after an action waits for more actions. Approving ten
 * photos, or a page's own refreshBadges() landing beside the automatic one,
 * becomes one badge request instead of several.
 */
const REFRESH_DEBOUNCE = 300;

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
  /** When the last request started (ms epoch), so focus and navigation can skip a fresh count. */
  const lastFetchAtRef = useRef(0);
  const pathname = usePathname();

  const fetchBadges = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    lastFetchAtRef.current = Date.now();
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
   * A refresh after an action (scheduleRefresh) is never skipped: it calls fetchBadges.
   */
  const pollBadges = useCallback(() => {
    if (inFlightRef.current > 0) return;
    void fetchBadges();
  }, [fetchBadges]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A refresh after something changed: never skipped, but coalesced. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchBadges();
    }, REFRESH_DEBOUNCE);
  }, [fetchBadges]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  // Refresh after any successful request that can move a badge, wherever it was
  // made. Pages used to have to call refreshBadges() themselves and most never
  // did: closing the last ticket on Issues left the old number in the sidebar
  // for up to two minutes. The list of routes lives in lib/badge-mutations.ts.
  const scheduleRefreshRef = useRef(scheduleRefresh);
  scheduleRefreshRef.current = scheduleRefresh;
  useEffect(() => {
    if (!user || typeof window.fetch !== 'function') return;
    const previous = window.fetch;
    const watched: typeof window.fetch = async (input, init) => {
      const res = await previous(input, init);
      try {
        if (res.ok) {
          const { method, url } = describeFetch(input, init);
          if (affectsBadges(method, url)) scheduleRefreshRef.current();
        }
      } catch {
        // Badges are non-critical: never let the watch break the request it watched.
      }
      return res;
    };
    window.fetch = watched;
    return () => {
      // Only unwrap if nobody wrapped on top of us since.
      if (window.fetch === watched) window.fetch = previous;
    };
  }, [user]);

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

  // Catch up when someone comes back to the window or moves to another page, but
  // only if the counts are stale: clicking through three pages in ten seconds
  // should not cost three requests.
  const pollIfStale = useCallback(() => {
    if (document.visibilityState === 'hidden') return;
    if (Date.now() - lastFetchAtRef.current < STALE_AFTER) return;
    pollBadges();
  }, [pollBadges]);

  useEffect(() => {
    if (!user) return;
    window.addEventListener('focus', pollIfStale);
    return () => window.removeEventListener('focus', pollIfStale);
  }, [user, pollIfStale]);

  const firstPathRef = useRef(true);
  useEffect(() => {
    // The mount effect above already fetched for the first page.
    if (firstPathRef.current) {
      firstPathRef.current = false;
      return;
    }
    if (user) pollIfStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const getBadgeCount = useCallback(
    (path: string): number => {
      const key = PATH_TO_BADGE_KEY[path];
      if (!key) return 0;
      return counts[key] || 0;
    },
    [counts],
  );

  const value = useMemo(() => ({ getBadgeCount, refreshBadges: scheduleRefresh }), [getBadgeCount, scheduleRefresh]);

  return (
    <NavBadgeContext.Provider value={value}>
      {children}
    </NavBadgeContext.Provider>
  );
}
