'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@neram/ui';
import NotificationsIcon from '@mui/icons-material/Notifications';

interface TimetableNotification {
  id: string;
  event_type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

const eventColors: Record<string, string> = {
  rsvp_attending: '#4caf50',
  rsvp_not_attending: '#f44336',
  class_created: '#2196f3',
  class_cancelled: '#ff9800',
  class_rescheduled: '#ff9800',
  holiday_marked: '#e91e63',
  recording_available: '#9c27b0',
  review_submitted: '#00bcd4',
};

interface TimetableNotificationBellProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
}

export default function TimetableNotificationBell({
  classroomId,
  getToken,
}: TimetableNotificationBellProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<TimetableNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable/notifications?classroom_id=${classroomId}&countOnly=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch {
      // ignore
    }
  }, [classroomId, getToken]);

  // Poll for unread count every 30 seconds
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable/notifications?classroom_id=${classroomId}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAllRead = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      await fetch('/api/timetable/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ markAll: true, classroom_id: classroomId }),
      });

      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      await fetch('/api/timetable/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const isOpen = Boolean(anchorEl);

  return (
    <>
      <IconButton
        onClick={handleOpen}
        sx={{ minWidth: 40, minHeight: 40 }}
        aria-label="Timetable notifications"
      >
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { width: 340, maxHeight: 420, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Timetable Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button size="small" onClick={handleMarkAllRead} sx={{ fontSize: '0.7rem', textTransform: 'none' }}>
              Mark all read
            </Button>
          )}
        </Box>
        <Divider />

        {/* Notification list */}
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {loading ? (
            <Typography variant="caption" color="text.disabled" sx={{ p: 2, display: 'block', textAlign: 'center' }}>
              Loading...
            </Typography>
          ) : notifications.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ p: 3, display: 'block', textAlign: 'center' }}>
              No notifications
            </Typography>
          ) : (
            <List dense disablePadding>
              {notifications.map((n) => (
                <ListItem
                  key={n.id}
                  onClick={() => !n.is_read && handleMarkRead(n.id)}
                  sx={{
                    cursor: n.is_read ? 'default' : 'pointer',
                    bgcolor: n.is_read ? 'transparent' : 'action.hover',
                    borderLeft: '3px solid',
                    borderLeftColor: eventColors[n.event_type] || 'grey.400',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="caption" sx={{ fontWeight: n.is_read ? 400 : 700 }}>
                        {n.title}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                          {n.message}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                          {formatTime(n.created_at)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
}
