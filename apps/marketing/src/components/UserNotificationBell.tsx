'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Popover,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
  CircularProgress,
} from '@neram/ui';
import { useTranslations } from 'next-intl';
import { tokens as t, errorColor } from '@/design-system';
import type { HeaderTone } from './header/header-tone';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { useUserNotifications } from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useRouter } from '@/i18n/routing';
import { usePathname } from 'next/navigation';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

const EVENT_TYPE_COLORS: Record<string, string> = {
  application_approved: t.statusDone,
  payment_received: t.statusDone,
  scholarship_approved: t.statusDone,
  scholarship_rejected: errorColor,
  scholarship_opened: t.statusReview,
  scholarship_revision_requested: t.statusDraft,
};

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

export default function UserNotificationBell({ tone = 'dark' }: { tone?: HeaderTone }) {
  const tr = useTranslations('header');
  const { user } = useFirebaseAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isEnrollPage = pathname?.includes('/enroll');
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
    apiBaseUrl: APP_URL,
    getIdToken,
    enabled: !!user && !isEnrollPage,
  });

  // Don't render on enroll page or if user is not logged in
  if (!user || isEnrollPage) return null;

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => setAnchorEl(null);

  const handleNotificationClick = async (notification: { id: string; is_read: boolean; event_type: string; metadata: Record<string, unknown> | null }) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    handleClose();

    if (notification.event_type === 'application_approved') {
      const applicationNumber = notification.metadata?.application_number as string | undefined;
      if (applicationNumber) {
        window.location.href = `/pay?app=${applicationNumber}`;
        return;
      }
    }

    // All notification types: navigate to apply page (ApplicationDashboard)
    router.push('/apply');
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? `${tr('notifications')} (${unreadCount})` : tr('notifications')}
        sx={{
          position: 'relative',
          width: 44,
          height: 44,
          ml: 0.5,
          flexShrink: 0,
          borderRadius: `${t.radius}px`,
          color: 'inherit',
          '&:hover': { bgcolor: tone === 'light' ? t.surfaceHover : 'rgba(255,255,255,0.08)' },
          '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: 2 },
        }}
      >
        <NotificationsNoneIcon sx={{ fontSize: 24 }} />
        {unreadCount > 0 && (
          <Box
            component="span"
            aria-hidden
            sx={{
              position: 'absolute',
              top: 9,
              right: 10,
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: t.gold500,
              border: `2px solid ${tone === 'light' ? t.surface : t.navy900}`,
              boxSizing: 'content-box',
            }}
          />
        )}
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
              borderRadius: `${t.radius}px`,
              border: `1px solid ${t.line}`,
              boxShadow: t.shadowMegaMenu,
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
            <NotificationsNoneIcon sx={{ fontSize: 40, color: t.lineStrong, mb: 1 }} />
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
                    bgcolor: EVENT_TYPE_COLORS[notification.event_type] || t.statusIdle,
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
