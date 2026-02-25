'use client';

import { useState } from 'react';
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
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useUserNotifications } from '@neram/ui';
import { getFirebaseAuth } from '@neram/auth';

const EVENT_TYPE_COLORS: Record<string, string> = {
  application_approved: '#4caf50',
  payment_received: '#9c27b0',
  scholarship_approved: '#4caf50',
  scholarship_rejected: '#f44336',
  scholarship_opened: '#2196f3',
  scholarship_revision_requested: '#ff5722',
};

function getNavigationUrl(notification: { event_type: string; metadata: Record<string, unknown> | null }): string | null {
  switch (notification.event_type) {
    case 'application_approved': {
      const leadProfileId = notification.metadata?.lead_profile_id as string | undefined;
      if (leadProfileId) {
        return `/payment/${leadProfileId}`;
      }
      return '/my-applications';
    }
    case 'scholarship_approved':
    case 'scholarship_rejected':
    case 'scholarship_opened':
    case 'scholarship_revision_requested':
      return '/my-applications';
    case 'payment_received':
      return '/my-applications';
    default:
      return null;
  }
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
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function UserNotificationBell() {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const getIdToken = async () => {
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return null;
      return await currentUser.getIdToken();
    } catch {
      return null;
    }
  };

  const {
    unreadCount,
    notifications,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useUserNotifications({
    apiBaseUrl: '',
    getIdToken,
  });

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => setAnchorEl(null);

  const handleNotificationClick = async (notification: { id: string; is_read: boolean; event_type: string; metadata: Record<string, unknown> | null }) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
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
      <IconButton onClick={handleOpen} size="small" sx={{ color: 'inherit', mr: 1 }}>
        <Badge badgeContent={unreadCount} color="error" max={99}>
          {unreadCount > 0 ? (
            <NotificationsIcon sx={{ fontSize: 24 }} />
          ) : (
            <NotificationsNoneIcon sx={{ fontSize: 24 }} />
          )}
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
            sx: {
              width: { xs: 'calc(100vw - 16px)', sm: 360 },
              maxWidth: { xs: 'calc(100vw - 16px)', sm: 360 },
              maxHeight: { xs: '70vh', sm: 480 },
              borderRadius: 2,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            },
          },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button size="small" onClick={markAllAsRead} sx={{ textTransform: 'none', fontSize: 12 }}>
              Mark all as read
            </Button>
          )}
        </Box>
        <Divider />
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <NotificationsNoneIcon sx={{ fontSize: 40, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No notifications yet
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ p: 0, maxHeight: { xs: '55vh', sm: 360 }, overflow: 'auto' }}>
            {notifications.map((notification) => (
              <ListItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: notification.is_read ? 'transparent' : 'action.hover',
                  '&:hover': { bgcolor: 'action.hover' },
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  minHeight: 56,
                  px: 2,
                  py: 1,
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
                    alignSelf: 'flex-start',
                  }}
                />
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      fontWeight={notification.is_read ? 'normal' : 'bold'}
                      sx={{ fontSize: 13 }}
                    >
                      {notification.title}
                    </Typography>
                  }
                  secondary={
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', fontSize: 12, lineHeight: 1.4, mt: 0.25 }}
                      >
                        {notification.message}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
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
