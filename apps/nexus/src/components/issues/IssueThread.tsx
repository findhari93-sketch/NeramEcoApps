'use client';

/**
 * One ticket's conversation, read the same way by both sides.
 *
 * Shared between /teacher/issues and /student/issues on purpose. A support
 * thread where the two people are looking at differently shaped records of the
 * same exchange is a thread neither can quote back at the other, and the
 * teacher-side timeline and a student-side one would have drifted apart inside
 * a release.
 *
 * The staff-only rows are a DISPLAY concern here and a database one in
 * getIssueActivityLog: a student's payload never contains an internal row, so
 * `showInternal` decides how staff see theirs, never whether a student could.
 */

import React from 'react';
import { Box, Chip, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { NexusFoundationIssueActivity } from '@neram/database/types';

/** What each non-comment row says in the timeline. */
const ACTION_LABELS: Record<string, string> = {
  created: 'reported this issue',
  assigned: 'assigned this issue',
  accepted: 'accepted this issue',
  delegated: 'delegated this issue',
  returned: 'returned this issue',
  marked_in_progress: 'marked as in progress',
  resolved: 'marked this as fixed',
  reopened: 'reopened this issue',
  comment: 'commented',
  confirmed: 'confirmed this is resolved',
  auto_closed: 'auto-closed, no response after 3 days',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

/** "Fri 12 Sep, 5:06 pm". Named days because people remember a day, not a date. */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export interface IssueThreadProps {
  activity: NexusFoundationIssueActivity[];
  /** The signed-in person, so their own messages sit on the right. */
  viewerId: string | null;
  loading?: boolean;
  /**
   * Staff view. Internal notes are rendered, marked, and visually separated.
   * A student page passes false and is served no internal rows in any case.
   */
  showInternal?: boolean;
  /** Shown when there is nothing yet. Each side phrases it differently. */
  emptyText?: string;
}

export default function IssueThread({
  activity,
  viewerId,
  loading = false,
  showInternal = false,
  emptyText = 'No messages yet.',
}: IssueThreadProps) {
  const theme = useTheme();

  if (loading) {
    // Two bars rather than a spinner, so the panel does not jump when the
    // thread arrives. Reserved height matches a short bubble.
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} aria-busy="true" aria-live="polite">
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1.5 }} />
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1.5, width: '70%' }} />
      </Box>
    );
  }

  const rows = showInternal ? activity : activity.filter((a) => a.visible_to_student !== false);

  if (rows.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
        {emptyText}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {rows.map((a) => {
        const mine = Boolean(viewerId) && a.actor_id === viewerId;
        const internal = a.visible_to_student === false;
        const isMessage = a.action === 'comment';

        // A status move carries no words, so it reads as a line of history
        // rather than as a bubble somebody has to answer.
        if (!isMessage) {
          return (
            <Box key={a.id} sx={{ px: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {a.actor_name || 'Someone'}
                </Box>{' '}
                {actionLabel(a.action)}
                {a.reason ? `: "${a.reason}"` : ''}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                {formatTimestamp(a.created_at)}
              </Typography>
            </Box>
          );
        }

        return (
          <Box
            key={a.id}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: mine ? 'flex-end' : 'flex-start',
            }}
          >
            <Box
              sx={{
                // Never wider than a comfortable reading measure, and never so
                // narrow that a phone wraps every third word.
                maxWidth: { xs: '92%', sm: '85%' },
                minWidth: 0,
                p: 1.25,
                borderRadius: 2,
                border: 1,
                borderColor: internal ? 'warning.light' : 'divider',
                bgcolor: internal
                  ? alpha(theme.palette.warning.main, 0.08)
                  : mine
                    ? alpha(theme.palette.primary.main, 0.08)
                    : 'action.hover',
                // A pasted URL or a long word wraps instead of scrolling the
                // whole panel sideways.
                overflowWrap: 'anywhere',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25, flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {mine ? 'You' : a.actor_name || 'Someone'}
                </Typography>
                {internal && (
                  <Chip
                    icon={<LockOutlinedIcon sx={{ fontSize: '0.75rem' }} />}
                    label="Staff only"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.65rem',
                      color: 'warning.dark',
                      bgcolor: alpha(theme.palette.warning.main, 0.16),
                      '& .MuiChip-label': { px: 0.5 },
                      '& .MuiChip-icon': { ml: 0.5, mr: -0.25, color: 'warning.dark' },
                    }}
                  />
                )}
              </Box>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {a.reason}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', fontSize: '0.7rem', display: 'block', mt: 0.5 }}
              >
                {formatTimestamp(a.created_at)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
