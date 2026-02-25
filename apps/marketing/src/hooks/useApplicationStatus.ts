'use client';

import { useState, useEffect, useRef } from 'react';
import { useFirebaseAuth } from '@neram/auth';

export type AppStatusSummary =
  | 'approved'
  | 'submitted'
  | 'under_review'
  | 'pending_verification'
  | 'draft'
  | null;

const CACHE_KEY = 'neram_app_status';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedStatus {
  status: AppStatusSummary;
  uid: string;
  ts: number;
}

function getCachedStatus(uid: string): AppStatusSummary | undefined {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const cached: CachedStatus = JSON.parse(raw);
    if (cached.uid !== uid) return undefined;
    if (Date.now() - cached.ts > CACHE_TTL) return undefined;
    return cached.status;
  } catch {
    return undefined;
  }
}

function setCachedStatus(uid: string, status: AppStatusSummary) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ status, uid, ts: Date.now() } satisfies CachedStatus)
    );
  } catch {
    // sessionStorage unavailable
  }
}

function clearCachedStatus() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

// Priority: approved > under_review/pending_verification > submitted > draft
const STATUS_PRIORITY: Record<string, number> = {
  approved: 4,
  under_review: 3,
  pending_verification: 3,
  submitted: 2,
  draft: 1,
};

/**
 * Hook that returns the highest-priority application status for the current user.
 * Used by the Header to show context-aware CTA buttons.
 */
export function useApplicationStatus(): {
  status: AppStatusSummary;
  loading: boolean;
} {
  const { user, loading: authLoading } = useFirebaseAuth();
  const [status, setStatus] = useState<AppStatusSummary>(null);
  const [loading, setLoading] = useState(true);
  const fetchedForUid = useRef<string | null>(null);

  useEffect(() => {
    // Not authenticated — no status
    if (authLoading) return;

    if (!user) {
      setStatus(null);
      setLoading(false);
      clearCachedStatus();
      fetchedForUid.current = null;
      return;
    }

    const uid = user.id;

    // Already fetched for this user
    if (fetchedForUid.current === uid) return;

    // Check cache first
    const cached = getCachedStatus(uid);
    if (cached !== undefined) {
      setStatus(cached);
      setLoading(false);
      fetchedForUid.current = uid;
      return;
    }

    // Fetch from API
    let cancelled = false;

    async function fetchStatus() {
      try {
        const idToken = await (user!.raw as any)?.getIdToken?.();
        if (!idToken || cancelled) return;

        const res = await fetch('/api/application', {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok || cancelled) return;

        const { data: applications } = await res.json();
        const apps = applications || [];

        // Find the highest-priority status
        let best: AppStatusSummary = null;
        let bestPriority = 0;

        for (const app of apps) {
          const s = app.status as string;
          const p = STATUS_PRIORITY[s] || 0;
          if (p > bestPriority) {
            bestPriority = p;
            best = s as AppStatusSummary;
          }
        }

        if (!cancelled) {
          setStatus(best);
          setCachedStatus(uid, best);
          fetchedForUid.current = uid;
        }
      } catch {
        // Silently fail — default to "Apply Now"
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { status, loading };
}
