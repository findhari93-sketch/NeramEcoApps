'use client';

/**
 * Support: every request this person has raised, grouped by whose turn it is.
 *
 *   Needs your reply   staff asked something, or a fix waits for a yes
 *   Open               with the team
 *   Closed             done (the newest five, then "Show all")
 *
 * "New request" opens the shared report form in support mode (topic first, no
 * page picture). /support?new=1 opens it straight away, for links from Help.
 *
 * Journey: entered from the tab bar, the sidebar, Help and the bell. Each card
 * opens /support/[id], whose Back returns here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Container, Skeleton, Typography, Alert } from '@neram/ui';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { useFirebaseAuth } from '@neram/auth';
import {
  ticketStatusMeta,
  ticketStudentQueueOf,
  TICKET_CATEGORY_LABEL,
  type TicketStudentQueue,
} from '@neram/database/support-ticket-status';
import ReportProblemDialog from '@/components/ReportProblemDialog';
import TicketStatusTracker from '@/components/support/TicketStatusTracker';
import TicketStatusChip from '@/components/support/TicketStatusChip';
import { getIdTokenOrNull, supportFetch, timeAgo } from '@/lib/support-client';
import type { StudentTicketListRow } from '@/lib/student-ticket-view';

const GROUPS: { key: TicketStudentQueue; title: string }[] = [
  { key: 'needs_you', title: 'Needs your reply' },
  { key: 'active', title: 'Open' },
  { key: 'closed', title: 'Closed' },
];

const CLOSED_PREVIEW = 5;

export default function SupportPage() {
  const { user } = useFirebaseAuth();
  const [tickets, setTickets] = useState<StudentTicketListRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showAllClosed, setShowAllClosed] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await supportFetch<{ tickets: StudentTicketListRow[] }>('/api/support-tickets?limit=100');
    if (res.ok && res.data) setTickets(res.data.tickets || []);
    else {
      setLoadError(res.message || 'Could not load your requests.');
      setTickets((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // /support?new=1 (from Help) opens the form at once. Read from window so the
  // page needs no Suspense boundary for useSearchParams.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1') {
        setDialogOpen(true);
        params.delete('new');
        const qs = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      }
    } catch {
      // ignore
    }
  }, []);

  const grouped = useMemo(() => {
    const out: Record<TicketStudentQueue, StudentTicketListRow[]> = { needs_you: [], active: [], closed: [] };
    for (const t of tickets || []) out[ticketStudentQueueOf(t.status)].push(t);
    return out;
  }, [tickets]);

  const loading = tickets === null;
  const isEmpty = !loading && (tickets?.length ?? 0) === 0;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 }, pb: { xs: 4, md: 6 } }}>
      <Box
        component="header"
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'flex-end' },
          justifyContent: 'space-between',
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography component="h1" sx={{ fontSize: { xs: '1.5rem', md: '1.75rem' }, fontWeight: 700 }}>
            Support
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: 0.25 }}>
            Ask us anything, or follow a request you sent.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, px: 2.5, flexShrink: 0 }}
        >
          New request
        </Button>
      </Box>

      {loadError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={load} sx={{ minHeight: 44, textTransform: 'none' }}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

      {loading ? (
        <Box aria-busy="true" aria-label="Loading your requests" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={112} />
          ))}
        </Box>
      ) : isEmpty && !loadError ? (
        <Box
          sx={{
            textAlign: 'center',
            px: 3,
            py: 5,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <SupportAgentOutlinedIcon aria-hidden="true" sx={{ fontSize: 48, color: 'text.secondary', mb: 1.5 }} />
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
            No requests yet
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: 0.5, mb: 2.5 }}>
            Something not working, or a question about a course? Send a request and we will reply here.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            New request
          </Button>
        </Box>
      ) : (
        GROUPS.map((group) => {
          const rows = grouped[group.key];
          if (rows.length === 0) return null;
          const visible =
            group.key === 'closed' && !showAllClosed ? rows.slice(0, CLOSED_PREVIEW) : rows;
          const headingId = `support-group-${group.key}`;
          return (
            <Box component="section" key={group.key} aria-labelledby={headingId} sx={{ mb: 3 }}>
              <Typography
                id={headingId}
                component="h2"
                sx={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: group.key === 'needs_you' ? 'text.primary' : 'text.secondary',
                  mb: 1,
                }}
              >
                {group.title} ({rows.length})
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {visible.map((t) => (
                  <li key={t.id}>
                    <TicketCard ticket={t} />
                  </li>
                ))}
              </Box>
              {group.key === 'closed' && rows.length > CLOSED_PREVIEW && (
                <Button
                  onClick={() => setShowAllClosed((v) => !v)}
                  sx={{ mt: 1, minHeight: 48, textTransform: 'none' }}
                  aria-expanded={showAllClosed}
                >
                  {showAllClosed ? 'Show fewer' : `Show all ${rows.length} closed`}
                </Button>
              )}
            </Box>
          );
        })
      )}

      <ReportProblemDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        getToken={getIdTokenOrNull}
        mode="support"
        onSubmitted={() => load()}
      />
    </Container>
  );
}

function TicketCard({ ticket }: { ticket: StudentTicketListRow }) {
  const meta = ticketStatusMeta(ticket.status);
  const needsYou = meta.turn === 'student';

  return (
    <Box
      component={Link}
      href={`/support/${ticket.id}`}
      data-testid="support-ticket-card"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 2,
        minHeight: 72,
        borderRadius: 2,
        border: '1px solid',
        borderColor: needsYou ? 'warning.main' : 'divider',
        bgcolor: 'background.paper',
        color: 'text.primary',
        textDecoration: 'none',
        transition: 'border-color 150ms ease, background-color 150ms ease',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'text.secondary' }}>
            {ticket.ticket_number}
          </Typography>
          <TicketStatusChip status={ticket.status} />
          {ticket.has_unread && (
            <Box
              component="span"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.8125rem', fontWeight: 700, color: 'primary.main' }}
            >
              <Box component="span" aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
              New reply
            </Box>
          )}
        </Box>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '1rem',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {ticket.subject}
        </Typography>
        <Box sx={{ mt: 1, maxWidth: 240 }}>
          <TicketStatusTracker status={ticket.status} compact />
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', mt: 0.75 }}>
          {TICKET_CATEGORY_LABEL[ticket.category] || 'Other'} · {timeAgo(ticket.last_reply_at || ticket.updated_at || ticket.created_at)}
        </Typography>
      </Box>
      <ChevronRightRoundedIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
    </Box>
  );
}
