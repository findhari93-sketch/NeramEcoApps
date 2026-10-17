'use client';

/**
 * The one thing the student should know or do about a ticket right now.
 *
 *   Received / Being worked on   who has it, nothing to do
 *   Needs your reply             the staff question, "Reply below"
 *   Fixed? Please confirm        the fix note, "Yes, it is fixed" / "Still happening"
 *   Closed, within 7 days        the outcome, "Still happening"
 *   Closed, after that           the outcome, "Report it again" (a new, linked request)
 *
 * Colour is never the only signal: every state has a heading in words.
 */

import { Box, Button, Typography, alpha, useTheme } from '@neram/ui';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined';
import {
  TICKET_OUTCOME_LABEL,
  TICKET_STUDENT_REOPEN_DAYS,
  ticketClosesInText,
} from '@neram/database/support-ticket-status';
import type { StudentTicketDetail } from '@/lib/student-ticket-view';

export interface TicketStatusBannerProps {
  ticket: StudentTicketDetail;
  /** The latest staff message, shown when they are waiting on the student. */
  staffQuestion: { text: string; author: string } | null;
  confirming: boolean;
  onConfirm: () => void;
  onStillHappening: () => void;
  onReportAgain: () => void;
  onReply: () => void;
}

const btn = { minHeight: 48, textTransform: 'none', fontWeight: 600 } as const;

function outcomeText(t: StudentTicketDetail): string | null {
  if (!t.resolution_code) return null;
  if (t.resolution_code === 'duplicate' && t.duplicate_of_number) {
    return `Duplicate of ${t.duplicate_of_number}`;
  }
  return TICKET_OUTCOME_LABEL[t.resolution_code] ?? null;
}

function reopenUntil(closedAt: string | null): string | null {
  if (!closedAt) return null;
  const t = new Date(closedAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + TICKET_STUDENT_REOPEN_DAYS * 86400000).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export default function TicketStatusBanner({
  ticket,
  staffQuestion,
  confirming,
  onConfirm,
  onStillHappening,
  onReportAgain,
  onReply,
}: TicketStatusBannerProps) {
  const theme = useTheme();
  const status = ticket.status;
  const closesIn = ticketClosesInText(ticket.auto_close_at);

  let tone: 'info' | 'warning' | 'success' | 'neutral' = 'info';
  let Icon = EngineeringOutlinedIcon;
  let heading = '';
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (status === 'waiting_on_student') {
    tone = 'warning';
    Icon = QuestionAnswerOutlinedIcon;
    heading = 'We need a little more from you';
    body = (
      <>
        {staffQuestion && (
          <Box
            component="blockquote"
            sx={{
              m: 0,
              mt: 1,
              pl: 1.5,
              borderLeft: '3px solid',
              borderColor: 'warning.main',
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {staffQuestion.text.length > 280 ? `${staffQuestion.text.slice(0, 280)}...` : staffQuestion.text}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {staffQuestion.author}
            </Typography>
          </Box>
        )}
        {closesIn && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            If we do not hear back, this {closesIn}.
          </Typography>
        )}
      </>
    );
    actions = (
      <Button variant="contained" onClick={onReply} sx={btn}>
        Reply below
      </Button>
    );
  } else if (status === 'awaiting_confirmation') {
    tone = 'success';
    Icon = TaskAltRoundedIcon;
    heading = 'We think this is fixed';
    body = (
      <>
        {ticket.resolution_notes && (
          <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {ticket.resolution_notes}
          </Typography>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          Please check and tell us.{closesIn ? ` If we do not hear back, this ${closesIn}.` : ''}
        </Typography>
      </>
    );
    actions = (
      <>
        <Button variant="contained" color="success" onClick={onConfirm} disabled={confirming} sx={btn}>
          {confirming ? 'Saving' : 'Yes, it is fixed'}
        </Button>
        <Button variant="outlined" onClick={onStillHappening} disabled={confirming} sx={btn}>
          Still happening
        </Button>
      </>
    );
  } else if (status === 'closed' || status === 'resolved') {
    tone = 'neutral';
    Icon = InventoryOutlinedIcon;
    const outcome = outcomeText(ticket);
    heading = outcome ? `Closed: ${outcome}` : 'Closed';
    const until = reopenUntil(ticket.closed_at);
    body = (
      <>
        {ticket.resolution_notes && (
          <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {ticket.resolution_notes}
          </Typography>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {ticket.can_reopen
            ? `Not sorted after all? You can reopen it${until ? ` until ${until}` : ''}.`
            : 'Still having trouble? Send a new request and we will link it to this one.'}
        </Typography>
      </>
    );
    actions = ticket.can_reopen ? (
      <Button variant="outlined" onClick={onStillHappening} sx={btn}>
        Still happening
      </Button>
    ) : (
      <Button variant="outlined" onClick={onReportAgain} sx={btn}>
        Report it again
      </Button>
    );
  } else {
    tone = 'info';
    Icon = EngineeringOutlinedIcon;
    heading = status === 'open' ? 'We have your request' : 'We are working on it';
    body = (
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
        {status === 'open'
          ? 'Someone from the team will pick it up soon. We will reply here and by email.'
          : `${ticket.handler_label || 'Our team'} is looking into it. We will reply here and by email.`}
      </Typography>
    );
  }

  const paletteColor =
    tone === 'warning'
      ? theme.palette.warning.main
      : tone === 'success'
        ? theme.palette.success.main
        : tone === 'info'
          ? theme.palette.primary.main
          : theme.palette.text.secondary;

  return (
    <Box
      role="status"
      data-testid="ticket-status-banner"
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(paletteColor, 0.4),
        bgcolor: alpha(paletteColor, 0.07),
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Icon aria-hidden="true" sx={{ color: paletteColor, mt: 0.25, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.35 }}>
            {heading}
          </Typography>
          {body}
        </Box>
      </Box>
      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1,
            mt: 2,
            '& > *': { flex: { xs: 'none', sm: '0 0 auto' } },
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
