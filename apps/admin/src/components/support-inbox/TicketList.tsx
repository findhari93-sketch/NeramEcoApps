'use client';

/**
 * The ticket list: one row per ticket, newest work first (the API decides the
 * order per queue). Skeleton rows while loading, an empty state per queue, and
 * Load more at the bottom.
 */
import { Avatar, Box, Button, CircularProgress, Tooltip, Typography } from '@neram/ui';
import InboxIcon from '@mui/icons-material/Inbox';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import type { SupportTicketListItem, SupportTicketQueue } from '@neram/database';
import {
  TICKET_SOURCE_LABEL,
  TICKET_STALE_NEW_DAYS,
  ticketClosesInText,
  ticketDaysSince,
  ticketStatusMeta,
} from '@neram/database/support-ticket-status';
import { EmptyState, OpsSkeleton } from '@/components/ops/OpsUi';
import { timeAgo } from '@/lib/support-inbox/timeline';
import { SegmentChip, initialsOf } from './bits';

const EMPTY: Record<SupportTicketQueue, { title: string; body: string }> = {
  new: { title: 'No new tickets', body: 'Everything that came in has been picked up.' },
  in_progress: { title: 'Nothing in progress', body: 'Start a ticket from New and it shows here.' },
  waiting: { title: 'Nobody to wait on', body: 'Tickets where you asked the requester for more show here.' },
  to_confirm: { title: 'Nothing to confirm', body: 'Resolved tickets wait here for the requester to confirm.' },
  closed: { title: 'No closed tickets', body: 'Closed tickets show here.' },
  all: { title: 'No tickets', body: 'No ticket matches these filters.' },
};

export function isUnread(t: Pick<SupportTicketListItem, 'last_reply_by' | 'last_reply_at' | 'staff_seen_at' | 'status'>): boolean {
  if (t.status === 'closed' || t.status === 'resolved') return false;
  if (t.last_reply_by !== 'student' || !t.last_reply_at) return false;
  return !t.staff_seen_at || Date.parse(t.staff_seen_at) < Date.parse(t.last_reply_at);
}

export function TicketList({
  tickets,
  loading,
  loadingMore,
  hasMore,
  error,
  queue,
  filtered,
  selectedId,
  onSelect,
  onLoadMore,
  onRetry,
  now,
}: {
  tickets: SupportTicketListItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  queue: SupportTicketQueue;
  filtered: boolean;
  selectedId: string | null;
  onSelect: (t: SupportTicketListItem) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  now: number;
}) {
  if (loading) {
    return (
      <Box aria-busy="true" aria-label="Loading tickets">
        {Array.from({ length: 7 }, (_, i) => (
          <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) 32px', gap: 1.25, px: 2, py: 1.5, borderBottom: 1, borderColor: 'grey.100' }}>
            <span />
            <Box>
              <OpsSkeleton width="40%" />
              <OpsSkeleton width="85%" />
              <OpsSkeleton width="60%" />
            </Box>
            <OpsSkeleton variant="circular" width={28} height={28} />
          </Box>
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <EmptyState
          icon={InboxIcon}
          title="Could not load tickets"
          body={error}
          action={
            <Button variant="outlined" startIcon={<ReplayIcon />} onClick={onRetry} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        />
      </Box>
    );
  }

  if (tickets.length === 0) {
    const empty = filtered ? { title: 'No matches', body: 'No ticket in this queue matches these filters.' } : EMPTY[queue];
    return (
      <Box sx={{ p: 2 }}>
        <EmptyState icon={InboxIcon} title={empty.title} body={empty.body} />
      </Box>
    );
  }

  return (
    <Box component="ul" aria-label="Tickets" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {tickets.map((t) => {
        const sel = t.id === selectedId;
        const unread = isUnread(t);
        const meta = ticketStatusMeta(t.status);
        const age = ticketDaysSince(t.created_at, now);
        const stale = t.status === 'open' && age >= TICKET_STALE_NEW_DAYS;
        const closesIn = t.status === 'waiting_on_student' || t.status === 'awaiting_confirmation' ? ticketClosesInText(t.auto_close_at, now) : null;
        return (
          <Box component="li" key={t.id}>
            <Box
              component="button"
              type="button"
              data-ticket={t.id}
              aria-current={sel ? 'true' : undefined}
              aria-label={`${t.ticket_number}: ${t.subject}${unread ? ', new reply' : ''}`}
              onClick={() => onSelect(t)}
              sx={{
                all: 'unset',
                boxSizing: 'border-box',
                width: '100%',
                minHeight: 56,
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '10px minmax(0,1fr) auto',
                gap: 1.25,
                px: 2,
                py: 1.25,
                borderBottom: 1,
                borderColor: 'grey.100',
                bgcolor: sel ? 'action.selected' : 'transparent',
                boxShadow: (th) => `inset 3px 0 0 ${sel ? th.palette.primary.main : 'transparent'}`,
                transition: 'background-color 150ms',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                '&:hover': { bgcolor: sel ? 'action.selected' : 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
            >
              <Box
                aria-hidden
                sx={{ width: 8, height: 8, mt: 0.75, borderRadius: '50%', bgcolor: unread ? 'primary.main' : 'transparent' }}
              />
              <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Typography component="span" sx={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>
                    {t.ticket_number}
                  </Typography>
                  {t.priority === 'high' && (
                    <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: 'error.dark', whiteSpace: 'nowrap' }}>
                      High
                    </Typography>
                  )}
                  {t.reopen_count > 0 && (
                    <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: 'error.dark', whiteSpace: 'nowrap' }}>
                      Reopened
                    </Typography>
                  )}
                  {t.screenshot_count > 0 && (
                    <ImageOutlinedIcon aria-label={`${t.screenshot_count} screenshots`} sx={{ fontSize: 15, color: 'text.secondary' }} />
                  )}
                </Box>
                <Typography component="span" noWrap sx={{ fontSize: 14, fontWeight: unread ? 700 : 600, color: 'text.primary' }}>
                  {t.subject}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
                  <Typography component="span" noWrap sx={{ fontSize: 12, color: 'text.secondary', maxWidth: 140 }}>
                    {t.user_name}
                  </Typography>
                  <SegmentChip segment={t.requester_segment} hasAccount={!!t.user_id} />
                  <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {TICKET_SOURCE_LABEL[t.source_app || ''] || 'Unknown app'}
                  </Typography>
                </Box>
                {(closesIn || (queueShowsStatus(queue) && meta)) && (
                  <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {queueShowsStatus(queue) ? meta.staffLabel : ''}
                    {queueShowsStatus(queue) && closesIn ? ' · ' : ''}
                    {closesIn}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75 }}>
                <Typography
                  component="span"
                  sx={{
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    fontWeight: stale ? 700 : 400,
                    color: stale ? 'text.primary' : 'text.secondary',
                    ...(stale ? { bgcolor: 'warning.light', border: 1, borderColor: 'warning.main', borderRadius: 1, px: 0.5 } : {}),
                  }}
                  title={stale ? `Waiting ${age} days for someone to start it` : undefined}
                >
                  {timeAgo(t.created_at, now)}
                </Typography>
                {t.assignee_name ? (
                  <Tooltip title={`Assigned to ${t.assignee_name}`}>
                    <Avatar aria-label={`Assigned to ${t.assignee_name}`} sx={{ width: 26, height: 26, fontSize: 11, bgcolor: 'primary.main' }}>
                      {initialsOf(t.assignee_name)}
                    </Avatar>
                  </Tooltip>
                ) : (
                  <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary' }}>
                    Unassigned
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
      {hasMore && (
        <Box component="li" sx={{ p: 1.5, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="outlined"
            onClick={onLoadMore}
            disabled={loadingMore}
            startIcon={loadingMore ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ minHeight: 44, minWidth: 160 }}
          >
            {loadingMore ? 'Loading' : 'Load more'}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function queueShowsStatus(queue: SupportTicketQueue): boolean {
  return queue === 'all';
}
