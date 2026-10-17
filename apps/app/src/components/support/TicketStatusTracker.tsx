'use client';

/**
 * Where a ticket is, as a four-step tracker (think parcel tracking):
 *
 *   Received ── Being worked on ── Fixed ── Closed
 *
 * "Needs your reply" is not a fifth step. It is step two with an amber dot and
 * a note, because work has started and is paused on the student, and a
 * tracker that jumps sideways reads as going backwards.
 *
 * Ported from apps/nexus/src/components/issues/IssueStatusTracker.tsx (student
 * side only), reading the shared rules in @neram/database/support-ticket-status.
 * Every state is said in words as well as colour, and nothing animates.
 */

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import { ticketStatusMeta, TICKET_TRACKER_STEPS } from '@neram/database/support-ticket-status';

export interface TicketStatusTrackerProps {
  status: string;
  /** Sub-label under the current step, e.g. "Waiting on you". */
  note?: string | null;
  /** A thin four-segment bar for list cards. The full version has labels. */
  compact?: boolean;
}

// Pixel strings on purpose: in sx a bare 1 means 100%, which made each hidden
// label a full-width box and scrolled the page sideways at 375px.
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export default function TicketStatusTracker({ status, note, compact = false }: TicketStatusTrackerProps) {
  const theme = useTheme();
  const meta = ticketStatusMeta(status);
  const steps = TICKET_TRACKER_STEPS.student;
  const closed = meta.step === 3;
  const waiting = meta.turn === 'student';

  // A closed ticket has finished every step, including the last.
  const stateOf = (i: number): 'done' | 'current' | 'todo' =>
    i < meta.step || (closed && i === 3) ? 'done' : i === meta.step ? 'current' : 'todo';

  const currentColor = waiting ? theme.palette.warning.main : theme.palette.primary.main;
  const doneColor = theme.palette.success.main;
  const todoColor = theme.palette.divider;

  const srText = (i: number) => {
    const st = stateOf(i);
    return st === 'done' ? ', done' : st === 'current' ? `, current step${waiting ? ', waiting on you' : ''}` : ', not yet';
  };

  if (compact) {
    return (
      <Box
        component="ol"
        aria-label="Progress"
        sx={{ display: 'flex', gap: 0.5, listStyle: 'none', p: 0, m: 0, width: '100%' }}
      >
        {steps.map((label, i) => {
          const st = stateOf(i);
          return (
            <Box
              component="li"
              key={label}
              aria-current={st === 'current' ? 'step' : undefined}
              sx={{
                position: 'relative',
                flex: 1,
                height: 4,
                borderRadius: 2,
                bgcolor: st === 'done' ? doneColor : st === 'current' ? currentColor : todoColor,
              }}
            >
              <Box component="span" sx={visuallyHidden}>
                {label}
                {srText(i)}
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box
      component="ol"
      aria-label="Progress"
      data-testid="ticket-status-tracker"
      sx={{ display: 'flex', listStyle: 'none', p: 0, m: 0, width: '100%' }}
    >
      {steps.map((label, i) => {
        const st = stateOf(i);
        const color = st === 'done' ? doneColor : st === 'current' ? currentColor : todoColor;
        return (
          <Box
            component="li"
            key={label}
            aria-current={st === 'current' ? 'step' : undefined}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
              // The connector to the previous step, drawn behind the dot.
              '&:not(:first-of-type)::before': {
                content: '""',
                position: 'absolute',
                top: 11,
                right: '50%',
                width: '100%',
                height: 2,
                bgcolor: st === 'todo' ? todoColor : doneColor,
                zIndex: 0,
              },
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: 'relative',
                zIndex: 1,
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: st === 'done' ? doneColor : 'background.paper',
                border: `2px solid ${color}`,
                boxShadow: st === 'current' ? `0 0 0 4px ${alpha(currentColor, 0.16)}` : 'none',
              }}
            >
              {st === 'done' && <CheckIcon sx={{ fontSize: 14, color: theme.palette.common.white }} />}
              {st === 'current' && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: currentColor }} />}
            </Box>
            <Typography
              variant="caption"
              sx={{
                mt: 0.5,
                px: 0.25,
                textAlign: 'center',
                lineHeight: 1.25,
                fontSize: '0.75rem',
                fontWeight: st === 'current' ? 700 : 500,
                color: st === 'todo' ? 'text.secondary' : 'text.primary',
              }}
            >
              {label}
              <Box component="span" sx={visuallyHidden}>
                {srText(i)}
              </Box>
            </Typography>
            {st === 'current' && note && (
              <Typography
                variant="caption"
                sx={{
                  textAlign: 'center',
                  lineHeight: 1.2,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  // text.primary, not warning.dark: amber text on white misses 4.5:1.
                  color: waiting ? 'text.primary' : 'text.secondary',
                }}
              >
                {note}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
