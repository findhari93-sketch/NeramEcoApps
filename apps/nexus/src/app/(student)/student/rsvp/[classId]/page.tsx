'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  Skeleton,
  Snackbar,
  Typography,
  alpha,
} from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import FlightTakeoffRoundedIcon from '@mui/icons-material/FlightTakeoffRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import RsvpReasonDialog, { type RsvpDeclinePayload } from '@/components/timetable/RsvpReasonDialog';
import { formatTime } from '@/components/timetable/date-utils';
import { describeReason } from '@/lib/rsvp-reasons';

interface RsvpClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  classroom_id: string;
  status: string;
  topic: string | null;
}

/** What the student has already told us about this class, if anything. */
type Answer =
  | { kind: 'none' }
  | { kind: 'coming' }
  | { kind: 'declined'; reason: string | null }
  | { kind: 'away'; summary: string };

/** "Thursday, 24 Jul" in IST wall-clock. */
function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

const BIG_BUTTON = { minHeight: 56, fontWeight: 700, borderRadius: 2, fontSize: '1rem' } as const;

/**
 * One-tap RSVP landing page, opened from the Teams class message and from
 * Neram Assistant's "will you be in class?" ask.
 *
 * Two shapes. Opened from the class message, everyone is attending by default
 * and this page only makes it easy for the few who cannot come to say so. Opened
 * from the ask (`?ask=1`, or the student was asked and has not answered), it
 * puts the question first with two equal answers, because the office will ring
 * anyone who stays silent and a yes is as useful to them as a no.
 */
export default function RsvpLandingPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const classId = String(params?.classId || '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cls, setCls] = useState<RsvpClass | null>(null);
  const [answer, setAnswer] = useState<Answer>({ kind: 'none' });
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(true);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' },
  );

  // Read once on mount rather than through useSearchParams, which needs a
  // Suspense boundary this page does not otherwise have.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ask') === '1') {
      setAsked(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Please sign in to answer.');
        return;
      }
      const res = await fetch(`/api/timetable/rsvp/context?class_id=${encodeURIComponent(classId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.code === 'not_enrolled'
            ? 'This class is not part of your classroom, so there is nothing to answer here.'
            : data.error || 'We could not load this class.',
        );
        return;
      }
      setCls(data.class);
      setOpen(data.open !== false);
      if (data.confirmation?.asked_at) setAsked(true);
      if (data.away) setAnswer({ kind: 'away', summary: data.away.summary });
      else if (data.myRsvp) {
        setAnswer({ kind: 'declined', reason: describeReason(data.myRsvp.reason_code, data.myRsvp.reason) });
      } else if (data.confirmation?.confirmed_at) setAnswer({ kind: 'coming' });
      else setAnswer({ kind: 'none' });
    } catch {
      setError('We could not load this class. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    if (classId) load();
  }, [classId, load]);

  const toast = (message: string, severity: 'success' | 'error' = 'success') =>
    setSnackbar({ open: true, message, severity });

  const submitRsvp = async (response: 'attending' | 'not_attending', decline?: RsvpDeclinePayload) => {
    if (!cls) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch('/api/timetable/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        class_id: cls.id,
        classroom_id: cls.classroom_id,
        response,
        reason_code: decline?.reasonCode,
        reason: decline?.note || undefined,
        wants_catchup: decline?.wantsCatchup,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || 'Could not save your answer', 'error');
      return;
    }
    if (response === 'attending') {
      setAnswer({ kind: 'coming' });
      toast(`Thanks, see you at ${formatTime(cls.start_time)}.`);
    } else {
      setAnswer({ kind: 'declined', reason: describeReason(decline?.reasonCode, decline?.note) });
      toast('Noted. We will send you the catch-up.');
    }
  };

  /**
   * "I will be away for a while" goes to the away dates, not to this class's
   * RSVP. The window explains every class it covers on its own, the same rule
   * the student timetable follows.
   */
  const submitAway = async (payload: RsvpDeclinePayload) => {
    if (!cls) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch('/api/student/away-windows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        starts_on: cls.scheduled_date,
        ends_on: payload.endsOn,
        reason_code: payload.reasonCode,
        reason_note: payload.note || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(body?.error || 'Could not save your away dates', 'error');
      return;
    }
    const summary = body?.window?.summary || 'Away dates saved';
    setAnswer({ kind: 'away', summary });
    toast(`Saved. ${summary}`);
  };

  const run = async (fn: () => Promise<void>) => {
    setSubmitting(true);
    try {
      await fn();
    } catch {
      toast('Could not save your answer', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const onDecline = (payload: RsvpDeclinePayload) =>
    run(async () => {
      if (payload.scope === 'window') await submitAway(payload);
      else await submitRsvp('not_attending', payload);
      setReasonOpen(false);
    });

  const comingButton = (label: string) => (
    <Button
      fullWidth
      variant="contained"
      color="success"
      size="large"
      startIcon={<CheckCircleRoundedIcon />}
      onClick={() => run(() => submitRsvp('attending'))}
      disabled={submitting}
      sx={BIG_BUTTON}
    >
      {label}
    </Button>
  );

  const cannotButton = (label: string) => (
    <Button
      fullWidth
      variant="outlined"
      color="error"
      size="large"
      startIcon={<EventBusyRoundedIcon />}
      onClick={() => setReasonOpen(true)}
      disabled={submitting}
      sx={BIG_BUTTON}
    >
      {label}
    </Button>
  );

  const statusLine = (icon: ReactNode, title: string, detail?: string | null) => (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
        {icon}
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Box>
      {detail && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {detail}
        </Typography>
      )}
    </>
  );

  const body = () => {
    if (!open) {
      return statusLine(
        <CalendarMonthRoundedIcon color="action" />,
        'This class is over',
        'There is nothing left to answer. Your timetable has the catch-up if you missed it.',
      );
    }
    if (answer.kind === 'away') {
      return (
        <>
          {statusLine(<FlightTakeoffRoundedIcon color="warning" />, 'You told us you are away', answer.summary)}
          <Button fullWidth variant="outlined" size="large" onClick={() => router.push('/student/planned-absence')} sx={BIG_BUTTON}>
            Change my away dates
          </Button>
        </>
      );
    }
    if (answer.kind === 'declined') {
      return (
        <>
          {statusLine(
            <EventBusyRoundedIcon color="error" />,
            'You told us you can’t make it',
            answer.reason ? `Reason: ${answer.reason}. We will send you the recording and assignment to catch up.` : null,
          )}
          {comingButton('Actually, I’ll attend')}
        </>
      );
    }
    if (answer.kind === 'coming') {
      return (
        <>
          {statusLine(
            <CheckCircleRoundedIcon color="success" />,
            'You said you’ll be there',
            'Thanks for letting us know. If something comes up, tell us here so nobody has to chase you.',
          )}
          {cannotButton('I can’t make it after all')}
        </>
      );
    }
    if (asked) {
      return (
        <>
          {statusLine(<HelpOutlineRoundedIcon color="primary" />, 'Will you be in this class?')}
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {comingButton('I’ll be there')}
            {cannotButton('I can’t come')}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Missing class is OK. Missing it without telling us is not, so please answer either way.
          </Typography>
        </>
      );
    }
    return (
      <>
        {statusLine(
          <CheckCircleRoundedIcon color="success" />,
          'You are marked attending',
          'Everyone is attending by default, so you do not need to do anything. Only tap below if you cannot make it.',
        )}
        {cannotButton('I can’t make it')}
      </>
    );
  };

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, py: { xs: 3, sm: 5 } }}>
      {loading && (
        <Box aria-busy="true" aria-label="Loading class" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5 }}>
          <Skeleton width="30%" />
          <Skeleton variant="text" sx={{ fontSize: '1.75rem' }} width="80%" />
          <Skeleton width="60%" />
          <Skeleton variant="rounded" height={56} sx={{ mt: 3 }} />
          <Skeleton variant="rounded" height={56} sx={{ mt: 1.5 }} />
        </Box>
      )}

      {!loading && error && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && cls && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: (t) => `0 1px 3px ${alpha(t.palette.common.black, 0.08)}`,
          }}
        >
          <Box sx={{ p: 2.5, bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }}>
            <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              {asked ? 'Confirm attendance' : 'Class RSVP'}
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>
              {cls.title}
            </Typography>
            {cls.topic && <Chip label={cls.topic} size="small" sx={{ mt: 1 }} />}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CalendarMonthRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">{formatDate(cls.scheduled_date)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <AccessTimeRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {formatTime(cls.start_time)} to {formatTime(cls.end_time)}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ p: 2.5 }}>
            {body()}
            <Button
              fullWidth
              variant="text"
              onClick={() => router.push('/student/timetable')}
              sx={{ mt: 1.5, minHeight: 48 }}
            >
              View my timetable
            </Button>
          </Box>
        </Box>
      )}

      <RsvpReasonDialog
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        classTitle={cls?.title || 'this class'}
        classSubtitle={cls ? `${formatDate(cls.scheduled_date)}, ${formatTime(cls.start_time)}` : undefined}
        classDate={cls?.scheduled_date}
        onSubmit={onDecline}
        submitting={submitting}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
