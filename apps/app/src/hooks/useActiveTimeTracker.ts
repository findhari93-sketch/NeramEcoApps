'use client';

import { useEffect, useRef, useCallback } from 'react';

const IDLE_THRESHOLD_MS = 15_000; // 15 seconds of no activity = idle
// Send heartbeat every 5 minutes. Seconds counted since the last send are
// flushed on hide and pagehide (sendHeartbeatOnExit), so none are lost.
const HEARTBEAT_INTERVAL_MS = 300_000;
const HEARTBEAT_URL = '/api/devices/heartbeat';

/**
 * Deliver a batch while the page is going away. sendBeacon survives unload;
 * when it is missing or refuses (queue full), a keepalive fetch does the same.
 */
export function sendHeartbeatOnExit(payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(HEARTBEAT_URL, body)) return;
  } catch {
    // fall through to fetch
  }
  try {
    void fetch(HEARTBEAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Heartbeat failures should never break the app
  }
}

interface UseActiveTimeTrackerOptions {
  deviceId: string | null;
  idToken: string | null;
  sessionId?: string | null;
  enabled?: boolean;
}

/**
 * Tracks active user time and sends heartbeats to the server.
 * Active time = time with mouse/touch/keyboard/scroll activity.
 * Idle time = time without any activity (after 15s threshold).
 */
export function useActiveTimeTracker({
  deviceId,
  idToken,
  sessionId,
  enabled = true,
}: UseActiveTimeTrackerOptions) {
  const activeSecondsRef = useRef(0);
  const idleSecondsRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const isActiveRef = useRef(true);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    if (!deviceId || !idToken) return;
    const active = activeSecondsRef.current;
    const idle = idleSecondsRef.current;

    // Reset counters
    activeSecondsRef.current = 0;
    idleSecondsRef.current = 0;

    if (active === 0 && idle === 0) return;

    try {
      // Collect location if available
      let location: { latitude: number; longitude: number; accuracy: number } | null = null;
      // Only read location the student already allowed. A background timer must
      // never be the thing that pops a permission prompt.
      if (navigator.geolocation && (await geolocationGranted())) {
        location = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
          );
        });
      }

      await fetch('/api/devices/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          deviceId,
          sessionId,
          activeSeconds: active,
          idleSeconds: idle,
          location,
        }),
      });
    } catch {
      // Heartbeat failures should never break the app
    }
  }, [deviceId, idToken, sessionId]);

  useEffect(() => {
    if (!enabled || !deviceId || !idToken) return;

    // Activity event handler
    const onActivity = () => {
      lastActivityRef.current = Date.now();
      isActiveRef.current = true;
    };

    // Listen for user activity events
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // Tick every second to count active vs idle
    tickIntervalRef.current = setInterval(() => {
      // A hidden tab is neither active nor idle; with nothing counted the
      // heartbeat skips its request (no polling from background tabs).
      if (document.visibilityState === 'hidden') return;
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity > IDLE_THRESHOLD_MS) {
        isActiveRef.current = false;
        idleSecondsRef.current += 1;
      } else {
        isActiveRef.current = true;
        activeSecondsRef.current += 1;
      }
    }, 1000);

    // Heartbeat every 5 minutes
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Flush the counted seconds when the page is hidden or torn down (tab
    // close, navigate away, app switch). Counters reset first, so a pagehide
    // followed by visibilitychange never sends the same seconds twice.
    const flushOnExit = () => {
      const active = activeSecondsRef.current;
      const idle = idleSecondsRef.current;
      activeSecondsRef.current = 0;
      idleSecondsRef.current = 0;

      if (active > 0 || idle > 0) {
        sendHeartbeatOnExit({
          idToken,
          deviceId,
          sessionId,
          activeSeconds: active,
          idleSeconds: idle,
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushOnExit();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushOnExit);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushOnExit);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

      // Send final heartbeat on cleanup
      sendHeartbeat();
    };
  }, [enabled, deviceId, idToken, sessionId, sendHeartbeat]);
}

async function geolocationGranted(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}
