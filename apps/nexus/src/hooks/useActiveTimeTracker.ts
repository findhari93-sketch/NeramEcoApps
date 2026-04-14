'use client';

import { useEffect, useRef, useCallback } from 'react';

const IDLE_THRESHOLD_MS = 15_000; // 15 seconds of no activity = idle
const HEARTBEAT_INTERVAL_MS = 60_000; // Send heartbeat every 60 seconds

interface UseActiveTimeTrackerOptions {
  deviceId: string | null;
  getToken: () => Promise<string | null>;
  sessionId?: string | null;
  enabled?: boolean;
}

/**
 * Tracks active user time and sends heartbeats to the server (Nexus/Microsoft auth).
 * Active time = time with mouse/touch/keyboard/scroll activity.
 * Idle time = time without any activity (after 15s threshold).
 */
export function useActiveTimeTracker({
  deviceId,
  getToken,
  sessionId,
  enabled = true,
}: UseActiveTimeTrackerOptions) {
  const activeSecondsRef = useRef(0);
  const idleSecondsRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const isActiveRef = useRef(true);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Only used by sendBeacon on page hide (async getToken unavailable there)
  const tokenRef = useRef<string | null>(null);

  const sendHeartbeat = useCallback(async () => {
    if (!deviceId) return;
    const active = activeSecondsRef.current;
    const idle = idleSecondsRef.current;

    // Reset counters
    activeSecondsRef.current = 0;
    idleSecondsRef.current = 0;

    if (active === 0 && idle === 0) return;

    try {
      // Always get a fresh token — MSAL handles caching and auto-refresh internally
      const token = await getToken();
      if (!token) return;

      // Keep beacon ref up to date with the last known valid token
      tokenRef.current = token;

      // Collect location if available
      let location: { latitude: number; longitude: number; accuracy: number } | null = null;
      if (navigator.geolocation) {
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
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
  }, [deviceId, sessionId, getToken]);

  useEffect(() => {
    if (!enabled || !deviceId) return;

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
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity > IDLE_THRESHOLD_MS) {
        isActiveRef.current = false;
        idleSecondsRef.current += 1;
      } else {
        isActiveRef.current = true;
        activeSecondsRef.current += 1;
      }
    }, 1000);

    // Heartbeat every 60 seconds
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Send beacon on page hide (tab close, navigate away)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const active = activeSecondsRef.current;
        const idle = idleSecondsRef.current;
        activeSecondsRef.current = 0;
        idleSecondsRef.current = 0;

        if ((active > 0 || idle > 0) && tokenRef.current) {
          navigator.sendBeacon(
            '/api/devices/heartbeat',
            JSON.stringify({
              deviceId,
              sessionId,
              activeSeconds: active,
              idleSeconds: idle,
            })
          );
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

      // Send final heartbeat on cleanup
      sendHeartbeat();
    };
  }, [enabled, deviceId, sendHeartbeat]);
}
