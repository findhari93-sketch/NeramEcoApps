'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UserNotificationItem {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface UseUserNotificationsOptions {
  /** Base URL for API calls. '' for same-origin, or full URL for cross-origin */
  apiBaseUrl: string;
  /** Function to get current Firebase ID token */
  getIdToken: () => Promise<string | null>;
  /** Polling interval in ms. Default: 60000 */
  pollInterval?: number;
  /** Whether polling is enabled. Default: true */
  enabled?: boolean;
}

export interface UseUserNotificationsReturn {
  unreadCount: number;
  notifications: UserNotificationItem[];
  loading: boolean;
  /** Call this when the bell is clicked to load the full list */
  fetchNotifications: () => Promise<void>;
  /** Mark a single notification as read */
  markAsRead: (notificationId: string) => Promise<void>;
  /** Mark all as read */
  markAllAsRead: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Shared unread-count poller.
//
// The bell is rendered more than once per app. apps/app mounts it three times
// (top bar, plus the mobile and desktop sidebars: MUI `display` breakpoints are
// CSS only and the mobile Drawer sets keepMounted, so all three subtrees stay
// mounted and alive). Marketing mounts two, admin two. Left to itself each mount
// ran its own interval, so one signed-in user paid three times over for one
// number, and a backgrounded tab kept paying indefinitely.
//
// One poller per apiBaseUrl shared by every mount, suspended while the tab is
// hidden and caught up on return. Same shape as the nexus NavBadgeProvider,
// which documents the reasoning in more detail.
// ---------------------------------------------------------------------------

type CountListener = (count: number) => void;

interface Poller {
  listeners: Set<CountListener>;
  getToken: () => Promise<string | null>;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
  count: number;
  /** Stops a slow network from stacking overlapping requests. */
  inFlight: boolean;
}

const pollers = new Map<string, Poller>();
let visibilityBound = false;

function emit(poller: Poller, count: number) {
  poller.count = count;
  poller.listeners.forEach((listener) => listener(count));
}

async function pollOnce(key: string) {
  const poller = pollers.get(key);
  if (!poller || poller.inFlight) return;
  poller.inFlight = true;
  try {
    const token = await poller.getToken();
    if (!token) return;
    const res = await fetch(`${key}/api/notifications?countOnly=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return;
    const data = await res.json();
    emit(poller, data.count || 0);
  } catch {
    // Silent: the badge is non-critical, and a noisy poll failure would bill a
    // log line every interval for as long as the outage lasts.
  } finally {
    poller.inFlight = false;
  }
}

function start(key: string) {
  const poller = pollers.get(key);
  if (!poller || poller.timer) return;
  poller.timer = setInterval(() => pollOnce(key), poller.intervalMs);
}

function stop(key: string) {
  const poller = pollers.get(key);
  if (!poller?.timer) return;
  clearInterval(poller.timer);
  poller.timer = null;
}

function handleVisibility() {
  if (document.visibilityState === 'hidden') {
    pollers.forEach((_, key) => stop(key));
    return;
  }
  // Catch up immediately on return. Waiting out the rest of the interval would
  // show a stale badge at the exact moment somebody is looking at it.
  pollers.forEach((_, key) => {
    pollOnce(key);
    start(key);
  });
}

function subscribe(
  key: string,
  getToken: () => Promise<string | null>,
  intervalMs: number,
  listener: CountListener
): () => void {
  let poller = pollers.get(key);
  const isNew = !poller;

  if (!poller) {
    poller = {
      listeners: new Set(),
      getToken,
      intervalMs,
      timer: null,
      count: 0,
      inFlight: false,
    };
    pollers.set(key, poller);
  }

  // Later mounts refresh the token getter (they are equivalent) and may shorten
  // the interval, never lengthen it on behalf of an existing subscriber.
  poller.getToken = getToken;
  poller.intervalMs = Math.min(poller.intervalMs, intervalMs);
  poller.listeners.add(listener);

  if (!visibilityBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
    visibilityBound = true;
  }

  // Seed a late subscriber from the shared value so a second bell paints the
  // right number immediately instead of showing 0 until the next tick.
  if (poller.count) listener(poller.count);

  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (isNew && !hidden) {
    pollOnce(key);
    start(key);
  }

  return () => {
    const current = pollers.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      stop(key);
      pollers.delete(key);
    }
  };
}

/**
 * Apply an optimistic count change to every mounted bell at once. Returns false
 * when there is no active poller, so the caller can fall back to local state.
 */
function setSharedCount(key: string, updater: (prev: number) => number): boolean {
  const poller = pollers.get(key);
  if (!poller) return false;
  emit(poller, Math.max(0, updater(poller.count)));
  return true;
}

export function useUserNotifications(
  options: UseUserNotificationsOptions
): UseUserNotificationsReturn {
  const { apiBaseUrl, getIdToken, pollInterval = 60000, enabled = true } = options;
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Held in a ref so that an unmemoized inline getIdToken at the call site
  // (which is what every consumer passes) cannot reach an effect dependency
  // array. It used to: getIdToken fed fetchWithAuth fed fetchUnreadCount fed the
  // polling effect, so a new function identity per render tore down the interval
  // and fired a fresh request on every render. Marketing's Header re-renders on
  // scroll-direction change, so simply scrolling a landing page was billing
  // requests. Keep this a ref even if the call sites are memoized later.
  const tokenRef = useRef(getIdToken);
  tokenRef.current = getIdToken;

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response | null> => {
      try {
        const token = await tokenRef.current();
        if (!token) return null;
        return fetch(`${apiBaseUrl}${url}`, {
          ...init,
          headers: {
            ...init?.headers,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        return null;
      }
    },
    [apiBaseUrl]
  );

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/notifications?limit=15&offset=0');
      if (res?.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        // Update unread count based on fetched data
        const unread = (data.notifications || []).filter(
          (n: UserNotificationItem) => !n.is_read
        ).length;
        const next = (prev: number) => Math.max(prev, unread);
        if (!setSharedCount(apiBaseUrl, next)) setUnreadCount(next);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, apiBaseUrl]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await fetchWithAuth('/api/notifications/mark-read', {
          method: 'POST',
          body: JSON.stringify({ notificationId }),
        });
        // Optimistic update, shared so every mounted bell agrees
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: true } : n
          )
        );
        const next = (prev: number) => prev - 1;
        if (!setSharedCount(apiBaseUrl, next)) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch {
        // Silent fail
      }
    },
    [fetchWithAuth, apiBaseUrl]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await fetchWithAuth('/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Optimistic update
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      if (!setSharedCount(apiBaseUrl, () => 0)) setUnreadCount(0);
    } catch {
      // Silent fail
    }
  }, [fetchWithAuth, apiBaseUrl]);

  // Every dependency here is a primitive, which is the point: this effect must
  // run on mount and unmount, not on render.
  useEffect(() => {
    if (!enabled) return;
    return subscribe(
      apiBaseUrl,
      () => tokenRef.current(),
      pollInterval,
      setUnreadCount
    );
  }, [enabled, apiBaseUrl, pollInterval]);

  return {
    unreadCount,
    notifications,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
