'use client';

import { useEffect, useRef, useState } from 'react';
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
import { pickSeenNotifications, SEEN_DWELL_MS } from '@/lib/notification-seen';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { notificationHref } from '@/lib/notification-links';

const EVENT_TYPE_COLORS: Record<string, string> = {
  classroom_enrolled: '#2196f3',
  batch_assigned: '#4caf50',
  batch_changed: '#ff9800',
  application_approved: '#4caf50',
  payment_received: '#9c27b0',
  scholarship_approved: '#4caf50',
  scholarship_rejected: '#f44336',
  scholarship_opened: '#2196f3',
  scholarship_revision_requested: '#ff5722',
  foundation_issue_reported: '#ed6c02',
  result_dispute_raised: '#ed6c02',
  // Amber for staff: a student found a mistake that other students are still
  // learning from. Green for the student: what they reported was acted on.
  qb_solution_reported: '#ed6c02',
  qb_report_resolved: '#2E7D32',
  foundation_issue_resolved: '#4caf50',
  foundation_issue_awaiting_confirmation: '#2196f3',
  foundation_issue_in_progress: '#2196f3',
  foundation_issue_assigned: '#9c27b0',
  foundation_issue_delegated: '#ff9800',
  foundation_issue_reopened: '#f44336',
  foundation_issue_closed: '#4caf50',
  foundation_issue_comment: '#0ea5e9',
  // Amber, and louder than a plain reply on purpose: this one asks the reader
  // to go and do something before the ticket can close.
  foundation_issue_recheck_requested: '#ed6c02',
  // Amber for the same reason: the ticket is waiting on the reader's answer.
  foundation_issue_info_requested: '#ed6c02',
  assignment_nudge: '#7c3aed',
  assignment_reviewed: '#2E7D32',
  study_material_nudge: '#0ea5e9',
  catchup_digest: '#7c3aed',
  catchup_behind_pace: '#ed6c02',
  // Good news, so green, like recap_ready: a cleared class and a clean slate.
  catchup_item_cleared: '#2E7D32',
  catchup_all_clear: '#2E7D32',
  catchup_note: '#7c3aed',
  // Green, not amber. This one is good news arriving early, and colouring it
  // like the chase messages beside it would make an offer of help read as
  // another reminder that they are behind.
  recap_ready: '#2E7D32',
  test_result_message: '#0ea5e9',
  test_reopened: '#2E7D32',
  // Amber, deliberately louder than the other two: a score that moved is the
  // one notification a student must not scroll past.
  test_regraded: '#ed6c02',
  sketch_reaction: '#db2777',
  sketch_featured: '#7c3aed',
  sketch_rhythm_nudge: '#ed6c02',
  sketch_milestone: '#2E7D32',
  sketch_digest: '#7c3aed',
  scorecard_reminder: '#0ea5e9',
  scorecard_released: '#2E7D32',
  exam_date_reminder: '#ed6c02',
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

export default function NotificationBell() {
  const router = useRouter();
  const { getTokenSilently, nexusRole } = useNexusAuthContext();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const {
    unreadCount,
    notifications,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useUserNotifications({
    apiBaseUrl: '',
    // Silent: the unread count polls every 60s, and the redirecting getToken would
    // send the page to Microsoft sign-in from that timer (PERF-0054).
    getIdToken: getTokenSilently,
  });

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => setAnchorEl(null);

  const handleNotificationClick = async (notification: {
    id: string;
    is_read: boolean;
    event_type: string;
    metadata: Record<string, unknown> | null;
  }) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    const url = notificationHref(notification, nexusRole);
    if (url) {
      handleClose();
      router.push(url);
    }
  };

  const open = Boolean(anchorEl);

  // Mark what the panel actually showed as read.
  //
  // handleOpen only fetched. Rows were marked read by tapping one, or by "Mark
  // all as read", so a purely informational row ("Issue Confirmed Resolved") had
  // no reason to ever be tapped and sat unread forever. The bell then advertised
  // news the user had plainly already read, and no amount of looking cleared it.
  //
  // Read from a ref and keyed on open/loading rather than on `notifications`:
  // markAsRead flips is_read in that array, which would otherwise restart this
  // timer on its own result.
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const markedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open || loading) return;
    const timer = setTimeout(() => {
      const seen = pickSeenNotifications(notificationsRef.current, markedRef.current);
      if (seen.length === 0) return;
      seen.forEach((id) => markedRef.current.add(id));
      // One POST per row on purpose. /api/notifications/mark-read takes a single
      // id, and all four apps share this hook: a `notificationIds` array would
      // be an unrecognised body in the other three and they would read it as
      // "mark ALL as read". Bounded by the page size, and markAsRead is what
      // decrements the shared count across every mounted bell. If a write fails,
      // the poller re-emits the true server count and the badge honestly returns.
      void Promise.all(seen.map((id) => markAsRead(id)));
    }, SEEN_DWELL_MS);
    return () => clearTimeout(timer);
  }, [open, loading, markAsRead]);

  return (
    <>
      <IconButton onClick={handleOpen} size="small" sx={{ color: 'inherit', mr: 0.5 }}>
        <Badge badgeContent={unreadCount} color="error" max={99}>
          {unreadCount > 0 ? (
            <NotificationsIcon sx={{ fontSize: 22 }} />
          ) : (
            <NotificationsNoneIcon sx={{ fontSize: 22 }} />
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
