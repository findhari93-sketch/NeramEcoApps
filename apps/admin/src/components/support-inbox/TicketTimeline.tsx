'use client';

/**
 * The conversation and the activity log on one line of time. Requester
 * messages sit left, staff replies right, internal notes are amber and say
 * Internal so they are never mistaken for something the requester saw.
 */
import { useMemo } from 'react';
import { Box, Chip, Typography } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { SupportTicketDetail } from '@neram/database';
import { buildTimeline, timeAgo, type TimelineItem } from '@/lib/support-inbox/timeline';
import { formatIst } from '@/lib/support-inbox/report-markdown';
import { Section } from './bits';

const TONE_COLOR: Record<Extract<TimelineItem, { kind: 'event' }>['tone'], string> = {
  neutral: 'text.secondary',
  info: 'info.dark',
  success: 'success.dark',
  // warning.dark (#E65100) is under 4.5:1 for small text on white: the dot carries the colour.
  warning: 'text.primary',
  error: 'error.dark',
};

export function TicketTimeline({ ticket, now }: { ticket: SupportTicketDetail; now: number }) {
  const items = useMemo(
    () => buildTimeline(ticket.comments || [], ticket.activity || [], ticket.user_name || 'The requester'),
    [ticket.comments, ticket.activity, ticket.user_name]
  );

  return (
    <Section title={`Timeline (${items.length})`}>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing yet. Replies, notes and status changes show here.
        </Typography>
      ) : (
        <Box component="ol" aria-label="Ticket timeline" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {items.map((item) =>
            item.kind === 'event' ? (
              <Box component="li" key={item.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', px: 0.5 }}>
                <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.tone === 'warning' ? 'warning.main' : TONE_COLOR[item.tone], flexShrink: 0, mt: 0.5 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: TONE_COLOR[item.tone] }}>
                    {item.text}
                  </Typography>
                  <Typography component="span" title={`${formatIst(item.at)} IST`} sx={{ fontSize: 12, color: 'text.secondary', ml: 1 }}>
                    {timeAgo(item.at, now)}
                  </Typography>
                  {item.staffOnly && (
                    <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary', ml: 1 }}>
                      (staff only)
                    </Typography>
                  )}
                  {item.reason && (
                    <Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'text.primary', mt: 0.25 }}>{item.reason}</Typography>
                  )}
                </Box>
              </Box>
            ) : (
              <Box
                component="li"
                key={item.id}
                sx={{ display: 'flex', justifyContent: item.side === 'staff' ? 'flex-end' : 'flex-start' }}
              >
                <Box
                  sx={{
                    maxWidth: '85%',
                    minWidth: 0,
                    borderRadius: 2,
                    px: 1.5,
                    py: 1,
                    border: 1,
                    borderColor: item.internal ? 'warning.main' : item.side === 'staff' ? 'primary.light' : 'divider',
                    bgcolor: (t) =>
                      item.internal
                        ? alpha(t.palette.warning.main, 0.12)
                        : item.side === 'staff'
                          ? alpha(t.palette.primary.main, 0.06)
                          : t.palette.grey[50],
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25, flexWrap: 'wrap' }}>
                    {item.internal && (
                      <Chip
                        size="small"
                        icon={<LockOutlinedIcon aria-hidden sx={{ fontSize: '14px !important' }} />}
                        label="Internal"
                        sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: 'warning.light', color: 'text.primary' }}
                      />
                    )}
                    <Typography component="span" sx={{ fontSize: 13, fontWeight: 700 }}>
                      {item.author}
                    </Typography>
                    <Typography component="span" title={`${formatIst(item.at)} IST`} sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {timeAgo(item.at, now)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>{item.content}</Typography>
                </Box>
              </Box>
            )
          )}
        </Box>
      )}
    </Section>
  );
}
