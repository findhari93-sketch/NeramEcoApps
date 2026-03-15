'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface PresenceEntry {
  availability: string;
  activity: string;
}

const POLL_INTERVAL = 60_000; // 60 seconds

export function usePresence(msOids: (string | null | undefined)[]) {
  const { getToken } = useNexusAuthContext();
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceEntry>>({});
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filter out null/undefined OIDs
  const validOids = msOids.filter((id): id is string => !!id);

  const fetchPresence = useCallback(async () => {
    if (validOids.length === 0) return;

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/graph/presence', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: validOids }),
      });

      if (!res.ok) return;

      const data = await res.json();
      const map: Record<string, PresenceEntry> = {};
      for (const p of data.presences || []) {
        map[p.id] = { availability: p.availability, activity: p.activity };
      }
      setPresenceMap(map);
    } catch {
      // Silently fail — presence is non-critical
    }
  }, [validOids.join(','), getToken]);

  useEffect(() => {
    if (validOids.length === 0) return;

    setLoading(true);
    fetchPresence().finally(() => setLoading(false));

    // Poll every 60 seconds
    intervalRef.current = setInterval(fetchPresence, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPresence]);

  return { presenceMap, loading };
}
