'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import BadgeEarnedToast from './BadgeEarnedToast';

// ── Types ──

interface UnreadBadge {
  id: string; // student_badge id
  badge_id: string;
  display_name: string;
  rarity_tier: string;
  icon_svg_path: string;
}

interface GamificationNotificationState {
  unreadCount: number;
  refreshNotifications: () => void;
}

// ── Context ──

const GamificationNotificationContext =
  createContext<GamificationNotificationState | null>(null);

export function useGamificationNotifications(): GamificationNotificationState {
  const ctx = useContext(GamificationNotificationContext);
  if (!ctx) {
    throw new Error(
      'useGamificationNotifications must be used within GamificationNotificationProvider'
    );
  }
  return ctx;
}

// ── Provider ──

interface GamificationNotificationProviderProps {
  children: React.ReactNode;
}

export default function GamificationNotificationProvider({
  children,
}: GamificationNotificationProviderProps) {
  const { getToken, user } = useNexusAuthContext();

  const [queue, setQueue] = useState<UnreadBadge[]>([]);
  const [currentBadge, setCurrentBadge] = useState<UnreadBadge | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const hasFetched = useRef(false);

  // Fetch unread badges on mount
  const fetchUnread = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/gamification/notifications/unread', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const data = await res.json();
      const badges: UnreadBadge[] = data.badges || [];

      if (badges.length > 0) {
        setQueue(badges);
        setUnreadCount(badges.length);
      }
    } catch {
      // Silently fail - notifications are non-critical
    }
  }, [getToken]);

  useEffect(() => {
    if (user && !hasFetched.current) {
      hasFetched.current = true;
      fetchUnread();
    }
  }, [user, fetchUnread]);

  // Process queue: show next badge toast
  useEffect(() => {
    if (queue.length > 0 && !toastOpen && !currentBadge) {
      const next = queue[0];
      setCurrentBadge(next);
      setToastOpen(true);
      setQueue((prev) => prev.slice(1));
    }
  }, [queue, toastOpen, currentBadge]);

  // Mark badges as read after showing
  const markRead = useCallback(
    async (badgeIds: string[]) => {
      try {
        const token = await getToken();
        if (!token) return;

        await fetch('/api/gamification/notifications/mark-read', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ badge_ids: badgeIds }),
        });
      } catch {
        // Silently fail
      }
    },
    [getToken]
  );

  const handleToastClose = useCallback(() => {
    if (currentBadge) {
      markRead([currentBadge.id]);
    }
    setToastOpen(false);

    // Small delay before showing next toast
    setTimeout(() => {
      setCurrentBadge(null);
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }, 300);
  }, [currentBadge, markRead]);

  const refreshNotifications = useCallback(() => {
    hasFetched.current = false;
    fetchUnread();
  }, [fetchUnread]);

  const value: GamificationNotificationState = {
    unreadCount,
    refreshNotifications,
  };

  return (
    <GamificationNotificationContext.Provider value={value}>
      {children}
      <BadgeEarnedToast
        badge={
          currentBadge
            ? {
                display_name: currentBadge.display_name,
                rarity_tier: currentBadge.rarity_tier,
                icon_svg_path: currentBadge.icon_svg_path,
              }
            : null
        }
        open={toastOpen}
        onClose={handleToastClose}
      />
    </GamificationNotificationContext.Provider>
  );
}
