'use client';

/**
 * One support request, as its owner follows it.
 *
 *   Back to Support (explicit href)
 *   number, status, subject
 *   tracker: Received, Being worked on, Fixed, Closed
 *   banner: the one thing to know or do now (reply, confirm, reopen, report again)
 *   what they sent
 *   the conversation: messages plus short system lines for each step
 *   reply box (hidden once closed: "Still happening" reopens instead)
 *
 * Opening the page marks staff replies read. Every move that loses a race
 * (409) reloads and says so. Entered from /support, the bell, or the email.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Skeleton,
  Snackbar,
  TextField,
  Typography,
} from '@neram/ui';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useFirebaseAuth } from '@neram/auth';
import { TICKET_CATEGORY_LABEL } from '@neram/database/support-ticket-status';
import ReportProblemDialog from '@/components/ReportProblemDialog';
import TicketStatusTracker from '@/components/support/TicketStatusTracker';
import TicketStatusBanner from '@/components/support/TicketStatusBanner';
import TicketStatusChip from '@/components/support/TicketStatusChip';
import StillHappeningSheet from '@/components/support/StillHappeningSheet';
import { getIdTokenOrNull, shortDateTime, supportFetch } from '@/lib/support-client';
import { eventLine } from '@/lib/student-ticket-view';
import type {
  StudentTicketEvent,
  StudentTicketMessage,
  StudentTicketPayload,
} from '@/lib/student-ticket-view';

type ThreadItem =
  | { kind: 'message'; at: string; message: StudentTicketMessage }
  | { kind: 'event'; at: string; event: StudentTicketEvent; text: string };

export default function TicketDetailPage() {
  const { user } = useFirebaseAuth();
  const params = useParams();
  const ticketId = String(params?.id || '');

  const [payload, setPayload] = useState<StudentTicketPayload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [againOpen, setAgainOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    const res = await supportFetch<StudentTicketPayload>(`/api/support-tickets/${encodeURIComponent(ticketId)}`);
    if (res.ok && res.data) {
      setPayload(res.data);
      setState('ready');
    } else if (res.status === 404 || res.status === 403) {
      setState('not_found');
    } else {
      setState((s) => (s === 'ready' ? s : 'error'));
      if (res.message) setToast(res.message);
    }
  }, [ticketId]);

  useEffect(() => {
    if (user && ticketId) load();
  }, [user, ticketId, load]);

  const thread = useMemo<ThreadItem[]>(() => {
    if (!payload) return [];
    const items: ThreadItem[] = [];
    for (const m of payload.comments) items.push({ kind: 'message', at: m.created_at, message: m });
    for (const e of payload.activity) {
      const text = eventLine(e);
      if (text) items.push({ kind: 'event', at: e.created_at, event: e, text });
    }
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [payload]);

  const staffQuestion = useMemo(() => {
    if (!payload) return null;
    const last = [...payload.comments].reverse().find((c) => c.side === 'staff');
    return last ? { text: last.content, author: last.author_label } : null;
  }, [payload]);

  const handleConflict = (message?: string | null) => {
    setToast(message || 'This request changed. Showing the latest.');
    load();
  };

  const confirm = async () => {
    setConfirming(true);
    const res = await supportFetch<{ ok: boolean }>(`/api/support-tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'confirm' }),
    });
    setConfirming(false);
    if (res.ok) {
      setToast('Thanks for confirming. We have closed it.');
      load();
    } else if (res.status === 409) handleConflict(res.message);
    else setToast(res.message || 'Could not save that. Please try again.');
  };

  const sendReply = async () => {
    const content = reply.trim();
    if (!content || sending) return;
    setSending(true);
    setReplyError(null);
    const res = await supportFetch<{ comment: StudentTicketMessage; status: string }>(
      `/api/support-tickets/${encodeURIComponent(ticketId)}/comments`,
      { method: 'POST', body: JSON.stringify({ content }) },
    );
    setSending(false);
    if (res.ok) {
      setReply('');
      load();
    } else if (res.status === 409) {
      handleConflict(res.message);
    } else {
      setReplyError(res.message || 'Could not send. Please try again.');
    }
  };

  const focusReply = () => {
    const el = replyRef.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  };

  const backLink = (
    <Button
      component={Link}
      href="/support"
      startIcon={<ArrowBackRoundedIcon />}
      sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, ml: -1, mb: 1 }}
    >
      Support
    </Button>
  );

  if (state === 'loading') {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 } }}>
        {backLink}
        <Box aria-busy="true" aria-label="Loading request">
          <Skeleton width={140} height={20} />
          <Skeleton width="80%" height={36} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={120} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={160} />
        </Box>
      </Container>
    );
  }

  if (state === 'not_found' || (state === 'error' && !payload)) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 } }}>
        {backLink}
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
            {state === 'not_found' ? 'We could not find that request' : 'Could not load this request'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 1, mb: 3 }}>
            {state === 'not_found'
              ? 'It may belong to another account. Your own requests are all in Support.'
              : 'Please check your connection and try again.'}
          </Typography>
          {state === 'error' ? (
            <Button variant="contained" onClick={() => { setState('loading'); load(); }} sx={{ minHeight: 48, textTransform: 'none' }}>
              Try again
            </Button>
          ) : (
            <Button variant="contained" component={Link} href="/support" sx={{ minHeight: 48, textTransform: 'none' }}>
              Go to Support
            </Button>
          )}
        </Box>
      </Container>
    );
  }

  const t = payload!.ticket;
  const isClosed = t.status === 'closed' || t.status === 'resolved';
  const waiting = t.status === 'waiting_on_student';

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 }, pb: { xs: 4, md: 6 } }}>
      {backLink}

      <Box component="header" sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
            {t.ticket_number}
          </Typography>
          <TicketStatusChip status={t.status} />
        </Box>
        <Typography
          component="h1"
          sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.5rem' }, lineHeight: 1.3, overflowWrap: 'anywhere' }}
        >
          {t.subject}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mt: 0.5 }}>
          {TICKET_CATEGORY_LABEL[t.category] || 'Other'} · Sent {shortDateTime(t.created_at)}
        </Typography>
      </Box>

      <Box sx={{ mb: 2.5, px: { xs: 0, sm: 1 } }}>
        <TicketStatusTracker status={t.status} note={waiting ? 'Waiting on you' : null} />
      </Box>

      <Box sx={{ mb: 3 }}>
        <TicketStatusBanner
          ticket={t}
          staffQuestion={waiting ? staffQuestion : null}
          confirming={confirming}
          onConfirm={confirm}
          onStillHappening={() => setSheetOpen(true)}
          onReportAgain={() => setAgainOpen(true)}
          onReply={focusReply}
        />
      </Box>

      <Box component="section" aria-labelledby="what-you-sent" sx={{ mb: 3 }}>
        <Typography id="what-you-sent" component="h2" sx={sectionHeading}>
          What you sent
        </Typography>
        <Box sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.9375rem' }}>
            {t.description}
          </Typography>
          {t.screenshot_urls.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
              {t.screenshot_urls.map((url, i) => (
                <Box
                  key={url}
                  component="a"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open picture ${i + 1} in a new tab`}
                  sx={{
                    width: 72,
                    height: 72,
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: 2 },
                  }}
                >
                  <Box
                    component="img"
                    src={url}
                    alt=""
                    loading="lazy"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                  />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      <Box component="section" aria-labelledby="conversation" sx={{ mb: 3 }}>
        <Typography id="conversation" component="h2" sx={sectionHeading}>
          Conversation
        </Typography>
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {thread.map((item) =>
            item.kind === 'event' ? (
              <Box
                component="li"
                key={`e-${item.event.id}`}
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, color: 'text.secondary', px: 0.5 }}
              >
                <FiberManualRecordIcon aria-hidden="true" sx={{ fontSize: 8, mt: '7px', flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.primary' }}>
                    {item.text}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: '0.8125rem', ml: 1 }}>
                    {shortDateTime(item.at)}
                  </Typography>
                  {item.event.action === 'reopened' && item.event.reason && (
                    <Typography sx={{ fontSize: '0.875rem', mt: 0.25, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      &ldquo;{item.event.reason}&rdquo;
                    </Typography>
                  )}
                </Box>
              </Box>
            ) : (
              <Box
                component="li"
                key={`m-${item.message.id}`}
                sx={{ display: 'flex', justifyContent: item.message.side === 'staff' ? 'flex-start' : 'flex-end' }}
              >
                <Box
                  sx={{
                    maxWidth: '88%',
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: item.message.side === 'staff' ? 'background.paper' : 'action.hover',
                  }}
                >
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary' }}>
                    {item.message.author_label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.9375rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {item.message.content}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
                    {shortDateTime(item.message.created_at)}
                  </Typography>
                </Box>
              </Box>
            ),
          )}
        </Box>
      </Box>

      {!isClosed && (
        <Box component="section" aria-labelledby="reply-heading">
          <Typography id="reply-heading" component="h2" sx={sectionHeading}>
            {waiting ? 'Your reply' : 'Add a message'}
          </Typography>
          <TextField
            inputRef={replyRef}
            label={waiting ? 'Answer their question' : 'Message'}
            placeholder="Write here"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendReply();
              }
            }}
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            inputProps={{ maxLength: 5000 }}
          />
          {replyError && (
            <Alert severity="error" role="alert" sx={{ mt: 1 }}>
              {replyError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button
              variant="contained"
              onClick={sendReply}
              disabled={!reply.trim() || sending}
              endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, px: 3, width: { xs: '100%', sm: 'auto' } }}
            >
              {sending ? 'Sending' : 'Send'}
            </Button>
          </Box>
        </Box>
      )}

      <StillHappeningSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        ticketId={t.id}
        onDone={({ message }) => {
          setSheetOpen(false);
          setToast(message);
          load();
        }}
      />

      <ReportProblemDialog
        open={againOpen}
        onClose={() => setAgainOpen(false)}
        getToken={getIdTokenOrNull}
        mode="support"
        prefill={{ title: `Follow-up to ${t.ticket_number}`, category: t.category }}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 'calc(var(--app-bottom-inset, 0px) + 16px)', md: 24 } }}
      />
    </Container>
  );
}

const sectionHeading = {
  fontSize: '0.8125rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'text.secondary',
  mb: 1,
} as const;
