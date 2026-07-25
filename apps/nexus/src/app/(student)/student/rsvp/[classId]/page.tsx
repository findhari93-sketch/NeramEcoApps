'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Snackbar,
  Typography,
  alpha,
} from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
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

/** "Thursday, 24 Jul" in IST wall-clock. */
function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

/**
 * One-tap RSVP landing page, opened from the Teams / WhatsApp class message.
 * Everyone is attending by default, so this page's whole job is making it easy
 * for the few who can't make it to say so (with a reason), and to flip back.
 */
export default function RsvpLandingPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const classId = String(params?.classId || '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cls, setCls] = useState<RsvpClass | null>(null);
  const [declined, setDeclined] = useState<{ reason: string | null } | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' },
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Please sign in to mark your RSVP.');
        return;
      }
      const res = await fetch(`/api/timetable/rsvp/context?class_id=${encodeURIComponent(classId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.code === 'not_enrolled'
            ? 'This class is not part of your classroom, so there is nothing to RSVP here.'
            : data.error || 'We could not load this class.',
        );
        return;
      }
      setCls(data.class);
      setDeclined(data.myRsvp ? { reason: describeReason(data.myRsvp.reason_code, data.myRsvp.reason) } : null);
    } catch {
      setError('We could not load this class. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    if (classId) load();
  }, [classId, load]);

  const submit = async (
    response: 'attending' | 'not_attending',
    decline?: RsvpDeclinePayload,
  ) => {
    if (!cls) return;
    setSubmitting(true);
    try {
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
      if (res.ok) {
        if (response === 'attending') {
          setDeclined(null);
          setSnackbar({ open: true, message: 'Great, we will see you in class!', severity: 'success' });
        } else {
          setDeclined({ reason: describeReason(decline?.reasonCode, decline?.note) });
          setSnackbar({ open: true, message: 'Noted, we will send you the catch-up.', severity: 'success' });
        }
        setReasonOpen(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Could not update your RSVP', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Could not update your RSVP', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, py: { xs: 3, sm: 5 } }}>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
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
          {/* Header */}
          <Box sx={{ p: 2.5, bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }}>
            <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              Class RSVP
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>
              {cls.title}
            </Typography>
            {cls.topic && (
              <Chip label={cls.topic} size="small" sx={{ mt: 1 }} />
            )}
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

          {/* Body — attending (default) vs declined */}
          <Box sx={{ p: 2.5 }}>
            {!declined ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                  <CheckCircleRoundedIcon color="success" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    You are marked attending
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                  Everyone is attending by default, so you do not need to do anything. Only tap below if you cannot make it.
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  color="error"
                  size="large"
                  startIcon={<EventBusyRoundedIcon />}
                  onClick={() => setReasonOpen(true)}
                  sx={{ minHeight: 52, fontWeight: 700, borderRadius: 2 }}
                >
                  I can&apos;t make it
                </Button>
              </>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                  <EventBusyRoundedIcon color="error" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    You told us you can&apos;t make it
                  </Typography>
                </Box>
                {declined.reason && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                    Reason: {declined.reason}. We will send you the recording and assignment to catch up.
                  </Typography>
                )}
                <Button
                  fullWidth
                  variant="contained"
                  color="success"
                  size="large"
                  startIcon={<CheckCircleRoundedIcon />}
                  onClick={() => submit('attending')}
                  disabled={submitting}
                  sx={{ minHeight: 52, fontWeight: 700, borderRadius: 2 }}
                >
                  Actually, I&apos;ll attend
                </Button>
              </>
            )}

            <Button
              fullWidth
              variant="text"
              onClick={() => router.push('/student/timetable')}
              sx={{ mt: 1.5, minHeight: 44 }}
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
        onSubmit={(payload) => submit('not_attending', payload)}
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
