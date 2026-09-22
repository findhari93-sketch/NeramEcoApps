'use client';

import { useEffect, useRef, useCallback } from 'react';

const IDLE_THRESHOLD_MS = 15_000; // 15 seconds of no activity = idle
const HEARTBEAT_INTERVAL_MS = 60_000; // Send heartbeat every 60 seconds
const HEARTBEAT_URL = '/api/devices/heartbeat';

interface UseActiveTimeTrackerOptions {
  deviceId: string | null;
  getToken: () => Promise<string | null>;
  sessionId?: string | null;
  enabled?: boolean;
}

interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface Counts {
  active: number;
  idle: number;
}

/**
 * The device's location, but only when the student has already allowed it.
 *
 * Asking from a timer put the browser's "wants to know your location" prompt in
 * front of every student about a minute after they opened Nexus, with nothing on
 * screen to say why (PERF-0036). A browser without the Permissions API gets no
 * location rather than a prompt.
 */
async function locationIfAllowed(): Promise<DeviceLocation | null> {
  if (!navigator.geolocation || !navigator.permissions?.query) return null;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state !== 'granted') return null;
  } catch {
    return null;
  }
  return new Promise((resolve) => {
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

/**
 * Tracks active user time and sends heartbeats to the server (Nexus/Microsoft auth).
 * Active time = time with mouse/touch/keyboard/scroll activity.
 * Idle time = time without any activity (after 15s threshold), while the tab is visible.
 *
 * A hidden tab counts nothing and sends nothing, and a minute with no activity is
 * not sent on its own: its idle time rides along with the next active minute. Before
 * this, 54% of a week's heartbeat rows on prod held no active time (PERF-0033).
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
  // The last token getToken handed out, for the page-hide flush, which cannot
  // wait for getToken before the page goes away.
  const tokenRef = useRef<string | null>(null);

  /** Take the counters for sending, or null when there is no active time to report. */
  const takeCounts = useCallback((): Counts | null => {
    const active = activeSecondsRef.current;
    if (active === 0) return null;
    const idle = idleSecondsRef.current;
    activeSecondsRef.current = 0;
    idleSecondsRef.current = 0;
    return { active, idle };
  }, []);

  const putBack = useCallback((counts: Counts) => {
    activeSecondsRef.current += counts.active;
    idleSecondsRef.current += counts.idle;
  }, []);

  const sendHeartbeat = useCallback(async () => {
    if (!deviceId) return;
    const counts = takeCounts();
    if (!counts) return;

    try {
      // Always get a fresh token: MSAL handles caching and auto-refresh internally
      const token = await getToken();
      if (!token) {
        putBack(counts);
        return;
      }
      tokenRef.current = token;

      await fetch(HEARTBEAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId,
          sessionId,
          activeSeconds: counts.active,
          idleSeconds: counts.idle,
          location: await locationIfAllowed(),
        }),
      });
    } catch {
      // Heartbeat failures should never break the app
    }
  }, [deviceId, sessionId, getToken, takeCounts, putBack]);

  useEffect(() => {
    if (!enabled || !deviceId) return;

    let tickInterval: ReturnType<typeof setInterval> | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    // Activity event handler
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const start = () => {
      if (tickInterval) return;
      // Coming back to the tab is activity.
      lastActivityRef.current = Date.now();

      // Tick every second to count active vs idle
      tickInterval = setInterval(() => {
        if (Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS) {
          idleSecondsRef.current += 1;
        } else {
          activeSecondsRef.current += 1;
        }
      }, 1000);

      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    };

    const stop = () => {
      if (tickInterval) clearInterval(tickInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      tickInterval = null;
      heartbeatInterval = null;
    };

    // The page may be going away (tab close, app switch, screen lock), so this
    // cannot wait for getToken. It used to go out as a sendBeacon, which cannot
    // carry an Authorization header, so the route refused every one and the
    // seconds were lost (PERF-0034). A keepalive fetch can carry the header and
    // still outlive the page. Without a token yet, the counts wait for later.
    const flushOnHide = () => {
      const token = tokenRef.current;
      if (!token) return;
      const counts = takeCounts();
      if (!counts) return;
      fetch(HEARTBEAT_URL, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId,
          sessionId,
          activeSeconds: counts.active,
          idleSeconds: counts.idle,
          location: null,
        }),
      }).catch(() => {
        // Heartbeat failures should never break the app
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        flushOnHide();
      } else {
        start();
      }
    };

    // Listen for user activity events
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Have a token in hand before the first heartbeat, so a flush in the first
    // minute can still authenticate.
    getToken()
      .then((token) => {
        if (token) tokenRef.current = token;
      })
      .catch(() => {});

    if (document.visibilityState !== 'hidden') start();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();

      // Send final heartbeat on cleanup
      sendHeartbeat();
    };
  }, [enabled, deviceId, sessionId, getToken, sendHeartbeat, takeCounts]);
}
