'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  IconButton,
  Badge,
  Popover,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
  CircularProgress,
} from '@neram/ui';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useAdminProfile } from '@/contexts/AdminProfileContext';

interface AdminNotification {
  id: string;
  event_type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_by: string | null;
  read_at: string | null;
  created_at: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  new_onboarding: '#4caf50',
  onboarding_skipped: '#ff9800',
  new_application: '#2196f3',
  payment_received: '#9c27b0',
  demo_registration: '#00bcd4',
  application_approved: '#4caf50',
  question_submitted: '#ff5722',
  question_edit_requested: '#795548',
  question_delete_requested: '#f44336',
  callback_reminder: '#ff9800',
  link_regeneration_requested: '#e91e63',
  ticket_created: '#ff9800',
  direct_enrollment_completed: '#4caf50',
};

const EVENT_SECTION_MAP: Record<string, string> = {
  new_application: 'application',
  application_approved: 'application',
  payment_received: 'payment',
  new_onboarding: 'onboarding',
  onboarding_skipped: 'onboarding',
  demo_registration: 'demo',
  new_callback: 'application',
  scholarship_opened: 'scholarship',
  scholarship_submitted: 'scholarship',
  scholarship_approved: 'scholarship',
  scholarship_rejected: 'scholarship',
  callback_reminder: 'callbacks',
};

function getNavigationUrl(notification: AdminNotification): string | null {
  if (notification.event_type === 'demo_registration') {
    const slotId = notification.metadata?.slot_id as string;
    if (slotId) return `/demo-classes/${slotId}`;
    return '/demo-classes';
  }

  if (['question_submitted', 'question_edit_requested', 'question_delete_requested'].includes(notification.event_type)) {
    return '/question-moderation';
  }

  if (notification.event_type === 'link_regeneration_requested') {
    const enrollmentLinkId = notification.metadata?.enrollment_link_id as string;
    if (enrollmentLinkId) return `/direct-enrollment?highlight=${enrollmentLinkId}`;
    return '/direct-enrollment';
  }

  if (notification.event_type === 'ticket_created') {
    const ticketId = notification.metadata?.ticket_id as string;
    if (ticketId) return `/support-tickets?highlight=${ticketId}`;
    return '/support-tickets';
  }

  if (notification.event_type === 'direct_enrollment_completed') {
    return '/direct-enrollment';
  }

  const userId = notification.metadata?.user_id as string;
  if (!userId) return null;

  const section = EVENT_SECTION_MAP[notification.event_type];
  if (section) return `/crm/${userId}?section=${section}`;
  return `/crm/${userId}`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function getDateGroup(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'This Week';
  return 'Earlier';
}

const PAGE_SIZE = 15;

export default function NotificationBell() {
  const { supabaseUserId } = useAdminProfile();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popoverOpenRef = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?isRead=false&limit=1&offset=0&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setUnreadCount(0);
        return;
      }
      const data = await res.json();
      setUnreadCount(data.count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
      setUnreadCount(0);
    }
  }, []);

  const fetchNotifications = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const currentOffset = loadMore ? notifications.length : 0;
      const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      const newNotifs: AdminNotification[] = data.notifications || [];
      if (loadMore) {
        setNotifications(prev => [...prev, ...newNotifs]);
      } else {
        setNotifications(newNotifs);
      }
      setHasMore(currentOffset + newNotifs.length < (data.count || 0));
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.length]);

  // Polling: always fetch unread count, also refresh list if popover is open
  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      fetchUnreadCount();
      if (popoverOpenRef.current) {
        // Refresh the list silently (don't reset pagination — just refresh the current visible set)
        fetch(`/api/notifications?limit=${PAGE_SIZE}&offset=0&_t=${Date.now()}`, { cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            if (data.notifications) {
              setNotifications(prev => {
                // Merge: prepend any new notifications, keep existing ones for pagination
                const existingIds = new Set(prev.map(n => n.id));
                const newOnes = (data.notifications as AdminNotification[]).filter(n => !existingIds.has(n.id));
                if (newOnes.length > 0) {
                  return [...newOnes, ...prev];
                }
                // Also update read state of visible notifications
                const updatedMap = new Map((data.notifications as AdminNotification[]).map(n => [n.id, n]));
                return prev.map(n => updatedMap.get(n.id) || n);
              });
            }
          })
          .catch(() => {});
      }
    }, 30000);
  }, [fetchUnreadCount]);

  useEffect(() => {
    fetchUnreadCount();
    startPolling();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUnreadCount, startPolling]);

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    popoverOpenRef.current = true;
    fetchNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
    popoverOpenRef.current = false;
    fetchUnreadCount();
  };

  const handleMarkAsRead = async (notificationId: string) => {
    if (!supabaseUserId) return;

    try {
      // Optimistic update
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );

      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, userId: supabaseUserId }),
      });

      if (!res.ok) {
        console.error('Failed to mark notification as read:', res.status);
      }
      fetchUnreadCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
      fetchUnreadCount();
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!supabaseUserId) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: supabaseUserId }),
      });

      if (!res.ok) {
        console.error('Failed to mark all notifications as read:', res.status);
      }
      fetchUnreadCount();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      fetchUnreadCount();
    }
  };

  const handleNotificationClick = (notification: AdminNotification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }
    const url = getNavigationUrl(notification);
    if (url) {
      handleClose();
      router.push(url);
    }
  };

  const open = Boolean(anchorEl);

  // Group notifications by date
  const groupedNotifications = React.useMemo(() => {
    const groups: { label: string; items: AdminNotification[] }[] = [];
    const groupMap = new Map<string, AdminNotification[]>();

    notifications.forEach(n => {
      const group = getDateGroup(n.created_at);
      if (!groupMap.has(group)) {
        groupMap.set(group, []);
      }
      groupMap.get(group)!.push(n);
    });

    // Maintain order: Today, Yesterday, This Week, Earlier
    const order = ['Today', 'Yesterday', 'This Week', 'Earlier'];
    order.forEach(label => {
      const items = groupMap.get(label);
      if (items && items.length > 0) {
        groups.push({ label, items });
      }
    });

    return groups;
  }, [notifications]);

  return (
    <>
      <IconButton
        onClick={handleOpen}
        size="small"
        sx={{ color: 'text.secondary' }}
      >
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { width: 400, maxHeight: 520 },
          },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Notifications
          </Typography>
          {notifications.some(n => !n.is_read) && (
            <Button size="small" onClick={handleMarkAllAsRead}>
              Mark all as read
            </Button>
          )}
        </Box>

        <Divider />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No notifications
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ p: 0, maxHeight: 420, overflow: 'auto' }}>
            {groupedNotifications.map(({ label, items }) => (
              <React.Fragment key={label}>
                <Typography
                  variant="overline"
                  sx={{
                    px: 2,
                    pt: 1.5,
                    pb: 0.5,
                    display: 'block',
                    color: 'text.disabled',
                    fontSize: '0.6875rem',
                    letterSpacing: '0.08em',
                  }}
                >
                  {label}
                </Typography>
                {items.map(notification => (
                  <ListItem
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: notification.is_read ? 'transparent' : 'action.hover',
                      '&:hover': { bgcolor: 'action.selected' },
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      py: 1.5,
                      px: 2,
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: notification.is_read
                          ? 'transparent'
                          : (EVENT_TYPE_COLORS[notification.event_type] || '#2196f3'),
                        mr: 1.5,
                        flexShrink: 0,
                        alignSelf: 'flex-start',
                        mt: 1,
                      }}
                    />
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          fontWeight={notification.is_read ? 'normal' : 600}
                          sx={{ mb: 0.25 }}
                        >
                          {notification.title}
                        </Typography>
                      }
                      secondary={
                        <span>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            component="span"
                            sx={{ display: 'block', fontSize: '0.8125rem' }}
                          >
                            {notification.message}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" component="span">
                            {timeAgo(notification.created_at)}
                          </Typography>
                        </span>
                      }
                    />
                  </ListItem>
                ))}
              </React.Fragment>
            ))}
            {hasMore && (
              <Box sx={{ p: 1.5, textAlign: 'center' }}>
                <Button
                  size="small"
                  onClick={() => fetchNotifications(true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : 'Load more'}
                </Button>
              </Box>
            )}
          </List>
        )}
      </Popover>
    </>
  );
}
