'use client';

import { useEffect, useRef } from 'react';

const IDLE_THRESHOLD_MS = 15_000; // 15s of no interaction = idle (don't count)
const FLUSH_INTERVAL_MS = 60_000; // Persist accrued seconds every 60s

/**
 * Silently measures idle-aware reading time on a single study file while its viewer is open, and
 * persists it to /api/study-materials/files/[id]/heartbeat. Mirrors useActiveTimeTracker but scoped
 * to one file: it ticks active seconds (only while the tab is visible and the user has interacted
 * within the idle threshold), flushes every 60s via fetch, and flushes the remainder on
 * tab-hide/unload/unmount via sendBeacon (which cannot set an Authorization header, so it uses
 * ?token=&seconds=). No-ops when disabled or when there is no file/token.
 */
export function useStudyTimeTracker(opts: {
  fileId: string | null;
  token: string | null;
  enabled: boolean;
}) {
  const { fileId, token, enabled } = opts;
  const pendingRef = useRef(0); // unflushed active seconds
  const lastActivityRef = useRef(Date.now());
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!enabled || !fileId || !token) return;

    lastActivityRef.current = Date.now();
    pendingRef.current = 0;

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'pointerdown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // Count one active second per tick while visible and recently interacted.
    const tick = setInterval(() => {
      if (document.visibilityState !== 'hidden' && Date.now() - lastActivityRef.current < IDLE_THRESHOLD_MS) {
        pendingRef.current += 1;
      }
    }, 1000);

    // Persist accrued seconds via fetch (Authorization header).
    const flushFetch = () => {
      const secs = pendingRef.current;
      if (secs <= 0) return;
      pendingRef.current = 0;
      fetch(`/api/study-materials/files/${fileId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify({ activeSeconds: secs }),
        keepalive: true,
      }).catch(() => {
        /* never break the viewer */
      });
    };

    // Beacon flush on hide/unload (headers unavailable → token+seconds in the query string).
    const flushBeacon = () => {
      const secs = pendingRef.current;
      if (secs <= 0 || !tokenRef.current) return;
      pendingRef.current = 0;
      const url = `/api/study-materials/files/${fileId}/heartbeat?token=${encodeURIComponent(
        tokenRef.current,
      )}&seconds=${secs}`;
      try {
        navigator.sendBeacon(url);
      } catch {
        /* ignore */
      }
    };

    const flushInterval = setInterval(flushFetch, FLUSH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushBeacon();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushBeacon);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushBeacon);
      clearInterval(tick);
      clearInterval(flushInterval);
      // On close (viewer dismissed / navigate), persist whatever is left.
      flushBeacon();
    };
  }, [enabled, fileId, token]);
}
