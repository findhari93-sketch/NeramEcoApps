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
  /** Polling interval in ms. Default: 30000 */
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

export function useUserNotifications(
  options: UseUserNotificationsOptions
): UseUserNotificationsReturn {
  const { apiBaseUrl, getIdToken, pollInterval = 30000, enabled = true } = options;
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response | null> => {
      try {
        const token = await getIdToken();
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
    [apiBaseUrl, getIdToken]
  );

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/notifications?countOnly=true');
      if (res?.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch {
      // Silent fail for polling
    }
  }, [fetchWithAuth]);

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
        setUnreadCount((prev) => Math.max(prev, unread));
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await fetchWithAuth('/api/notifications/mark-read', {
          method: 'POST',
          body: JSON.stringify({ notificationId }),
        });
        // Optimistic update
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Silent fail
      }
    },
    [fetchWithAuth]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await fetchWithAuth('/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Optimistic update
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Silent fail
    }
  }, [fetchWithAuth]);

  // Poll for unread count
  useEffect(() => {
    if (!enabled) return;
    fetchUnreadCount();
    intervalRef.current = setInterval(fetchUnreadCount, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, fetchUnreadCount, pollInterval]);

  return {
    unreadCount,
    notifications,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
