'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Demo registrations navigate to the demo class slot detail page
  if (notification.event_type === 'demo_registration') {
    const slotId = notification.metadata?.slot_id as string;
    if (slotId) return `/demo-classes/${slotId}`;
    return '/demo-classes';
  }

  // Question moderation events navigate to the moderation page
  if (['question_submitted', 'question_edit_requested', 'question_delete_requested'].includes(notification.event_type)) {
    return '/question-moderation';
  }

  // Link regeneration requests navigate to direct enrollment with highlight
  if (notification.event_type === 'link_regeneration_requested') {
    const enrollmentLinkId = notification.metadata?.enrollment_link_id as string;
    if (enrollmentLinkId) return `/direct-enrollment?highlight=${enrollmentLinkId}`;
    return '/direct-enrollment';
  }

  // Support tickets navigate to the ticket management page
  if (notification.event_type === 'ticket_created') {
    const ticketId = notification.metadata?.ticket_id as string;
    if (ticketId) return `/support-tickets?highlight=${ticketId}`;
    return '/support-tickets';
  }

  // Direct enrollment completed
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

export default function NotificationBell() {
  const { supabaseUserId } = useAdminProfile();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?isRead=false&limit=1&offset=0');
      const data = await res.json();
      setUnreadCount(data.count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications?limit=10&offset=0');
      const data = await res.json();
      setNotifications(data.notifications || []);
      // Also update unread count from the data
      const unread = (data.notifications || []).filter((n: AdminNotification) => !n.is_read).length;
      setUnreadCount((prev) => Math.max(prev, unread));
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchUnreadCount();

    // Poll every 30 seconds
    intervalRef.current = setInterval(fetchUnreadCount, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchUnreadCount]);

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAsRead = async (notificationId: string) => {
    if (!supabaseUserId) return;

    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, userId: supabaseUserId }),
      });

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!supabaseUserId) return;

    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: supabaseUserId }),
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleNotificationClick = async (notification: AdminNotification) => {
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
            sx: { width: 360, maxHeight: 480 },
          },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Notifications
          </Typography>
          {unreadCount > 0 && (
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
          <List dense sx={{ p: 0, maxHeight: 360, overflow: 'auto' }}>
            {notifications.map((notification) => (
              <ListItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: notification.is_read ? 'transparent' : 'action.hover',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: EVENT_TYPE_COLORS[notification.event_type] || '#757575',
                    mr: 1.5,
                    flexShrink: 0,
                    mt: 0.5,
                  }}
                />
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      fontWeight={notification.is_read ? 'normal' : 'bold'}
                      noWrap
                    >
                      {notification.title}
                    </Typography>
                  }
                  secondary={
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {notification.message}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {timeAgo(notification.created_at)}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}
