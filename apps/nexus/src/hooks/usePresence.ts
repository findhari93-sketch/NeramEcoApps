'use client';

import { useState, useEffect, useRef } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface PresenceEntry {
  availability: string;
  activity: string;
}

const POLL_INTERVAL = 60_000; // 60 seconds

/**
 * Teams presence for a list of people, refreshed every minute while the page is
 * visible.
 *
 * Starts only once `tokenReady` is true, rather than calling getToken() on
 * mount: getToken() waits out the MSAL boot, which serialised this request
 * behind the page's own first load (PERF-0054). A hidden tab does not poll at
 * all; coming back to it refreshes immediately, so the dots are never stale
 * when someone is actually looking.
 */
export function usePresence(msOids: (string | null | undefined)[]) {
  const { getToken, tokenReady } = useNexusAuthContext();
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceEntry>>({});
  const [loading, setLoading] = useState(false);

  // Latest getToken without making it an effect dependency: its identity can
  // change on a silent refresh, and that must not restart the poll.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Filter out null/undefined OIDs. The joined key is what the effect depends on.
  const key = msOids.filter((id): id is string => !!id).join(',');

  useEffect(() => {
    if (!tokenReady || !key) return;
    const ids = key.split(',');
    let cancelled = false;

    const fetchPresence = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token || cancelled) return;

        const res = await fetch('/api/graph/presence', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        });

        if (!res.ok || cancelled) return;

        const data = await res.json();
        const map: Record<string, PresenceEntry> = {};
        for (const p of data.presences || []) {
          map[p.id] = { availability: p.availability, activity: p.activity };
        }
        if (!cancelled) setPresenceMap(map);
      } catch {
        // Silently fail, presence is non-critical
      }
    };

    setLoading(true);
    fetchPresence().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void fetchPresence();
    }, POLL_INTERVAL);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchPresence();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tokenReady, key]);

  return { presenceMap, loading };
}
