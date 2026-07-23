'use client';

/**
 * Catching up on a class you missed.
 *
 * Three steps in order, because doing them out of order is not catching up:
 * say why you missed it, watch the recording, finish the work. Then say you are
 * done, which is a deliberate act rather than something inferred from a
 * progress bar.
 *
 * The reason step comes first not to nag but because it is the only part the
 * teacher cannot find out any other way.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RSVP_REASONS } from '@/lib/rsvp-reasons';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';
import { formatTime } from '@/components/timetable/date-utils';

interface CatchUpData {
  class: {
    id: string;
    title: string;
    description: string | null;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    recording_url: string | null;
    youtube_url: string | null;
  };
  absence: { reason_code: string | null; reason_note: string | null } | null;
  assignments: Array<{ id: string; title: string; assignment_type: string; submitted: boolean }>;
  recap: { id: string; status: string } | null;
  steps: { reasonGiven: boolean; watched: boolean; workDone: boolean; caughtUp: boolean };
  hasRecording: boolean;
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function CatchUpPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();

  const [data, setData] = useState<CatchUpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/catch-up`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Could not load this catch-up.');
        return;
      }
      setData(body);
      setReasonCode(body.absence?.reason_code || '');
      setNote(body.absence?.reason_note || '');
    } catch {
      setError('Could not load this catch-up.');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/catch-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSnack({ msg: success, sev: 'success' });
        await load();
      } else {
        setSnack({ msg: body.error || 'Could not save', sev: 'error' });
      }
    } catch {
      setSnack({ msg: 'Could not save', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          {error || 'Nothing to catch up on here.'}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/student/timetable')}
          sx={{ mt: 2, textTransform: 'none', minHeight: 44 }}
        >
          Back to the timetable
        </Button>
      </Box>
    );
  }

  const { steps, assignments, recap } = data;
  const cls = data.class;
  // A guided recap is the better way to watch when one exists: it checkpoints
  // and quizzes. Otherwise the raw recording, YouTube first since Teams copies
  // expire.
  const watchHref = recap
    ? `/student/class-recaps/${recap.id}`
    : cls.youtube_url || cls.recording_url;

  const stepBox = (
    n: number,
    done: boolean,
    title: string,
    children: React.ReactNode,
    locked = false,
  ) => (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 2,
        borderRadius: RADIUS.card,
        border: `1px solid ${done ? alpha(theme.palette.success.main, 0.4) : theme.palette.divider}`,
        bgcolor: done ? alpha(theme.palette.success.main, 0.04) : 'background.paper',
        boxShadow: SHADOW.card,
        opacity: locked ? 0.55 : 1,
      }}
    >
      <Box sx={{ pt: 0.25, flexShrink: 0 }}>
        {done ? (
          <CheckCircleIcon sx={{ fontSize: 22, color: 'success.main' }} />
        ) : (
          <RadioButtonUncheckedIcon sx={{ fontSize: 22, color: 'text.disabled' }} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.75 }}>
          {n}. {title}
        </Typography>
        {children}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto', pb: 10 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/student/timetable')}
        sx={{ textTransform: 'none', minHeight: 44, ml: -1, mb: 1 }}
      >
        Back to the timetable
      </Button>

      <Typography
        sx={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'primary.main',
        }}
      >
        Catch up, you missed this on {formatDay(cls.scheduled_date)}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, lineHeight: 1.25 }}>
        {cls.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {formatTime(cls.start_time)} to {formatTime(cls.end_time)}
      </Typography>

      {cls.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {cls.description}
        </Typography>
      )}

      {steps.caughtUp && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          You have caught up on this class. Nothing else to do.
        </Alert>
      )}

      <Stack spacing={1.25}>
        {/* 1. Why. The only part the teacher cannot find out any other way. */}
        {stepBox(
          1,
          steps.reasonGiven,
          'Tell us why you missed it',
          steps.reasonGiven ? (
            <Typography variant="body2" color="text.secondary">
              {RSVP_REASONS.find((r) => r.code === data.absence?.reason_code)?.label ||
                'Reason given'}
              {data.absence?.reason_note ? `, ${data.absence.reason_note}` : ''}
            </Typography>
          ) : (
            <>
              <Stack spacing={0.75} sx={{ mb: 1.25 }}>
                {RSVP_REASONS.map((r) => {
                  const on = reasonCode === r.code;
                  return (
                    <Box
                      key={r.code}
                      component="button"
                      type="button"
                      onClick={() => setReasonCode(r.code)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: '100%',
                        minHeight: 48,
                        px: 1.5,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '0.875rem',
                        fontWeight: on ? 700 : 500,
                        appearance: 'none',
                        borderRadius: RADIUS.control,
                        border: `1px solid ${on ? theme.palette.primary.main : theme.palette.divider}`,
                        bgcolor: on ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                        color: on ? theme.palette.primary.dark : theme.palette.text.primary,
                      }}
                    >
                      {on ? (
                        <CheckCircleIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                      ) : (
                        <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                      )}
                      {r.label}
                    </Box>
                  );
                })}
              </Stack>
              {reasonCode === 'other' && (
                <TextField
                  fullWidth
                  size="small"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened?"
                  sx={{ mb: 1.25 }}
                />
              )}
              <Button
                variant="contained"
                disabled={busy || !reasonCode}
                onClick={() =>
                  act(
                    { action: 'give_reason', reason_code: reasonCode, reason_note: note },
                    'Thanks, your teacher can see that now.',
                  )
                }
                sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
              >
                Save reason
              </Button>
            </>
          ),
        )}

        {/* 2. Watch. */}
        {stepBox(
          2,
          steps.watched,
          'Watch the recording',
          !data.hasRecording ? (
            <Typography variant="body2" color="text.secondary">
              The recording is not up yet. Check back, or ask your teacher.
            </Typography>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {watchHref && (
                <Button
                  variant={steps.watched ? 'outlined' : 'contained'}
                  href={watchHref}
                  {...(recap ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                  startIcon={<SmartDisplayOutlinedIcon />}
                  sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                >
                  {recap ? 'Open the guided recap' : steps.watched ? 'Watch again' : 'Watch now'}
                </Button>
              )}
              {!steps.watched && (
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => act({ action: 'mark_watched' }, 'Marked as watched.')}
                  sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                >
                  I have watched it
                </Button>
              )}
            </Stack>
          ),
        )}

        {/* 3. The work. Locked until the recording is watched: doing the
              assignment without the class is not catching up. */}
        {stepBox(
          3,
          steps.workDone,
          assignments.length === 0 ? 'Nothing was set in this class' : 'Finish the assignment',
          assignments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No assignment came out of this class.
            </Typography>
          ) : !steps.watched ? (
            <Typography variant="body2" color="text.secondary">
              Watch the recording first.
            </Typography>
          ) : (
            <Stack spacing={0.75}>
              {assignments.map((a) => (
                <Stack
                  key={a.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ flexWrap: 'wrap' }}
                >
                  {a.submitted ? (
                    <CheckCircleIcon sx={{ fontSize: 17, color: 'success.main' }} />
                  ) : (
                    <RadioButtonUncheckedIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
                  )}
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 120, fontWeight: 600 }}>
                    {a.title}
                  </Typography>
                  {!a.submitted && (
                    <Button
                      size="small"
                      variant="outlined"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                      onClick={() => router.push(`/student/assignments/${a.id}`)}
                      sx={{ textTransform: 'none', minHeight: 40 }}
                    >
                      Open
                    </Button>
                  )}
                </Stack>
              ))}
            </Stack>
          ),
          assignments.length > 0 && !steps.watched,
        )}
      </Stack>

      {!steps.caughtUp && (
        <Box sx={{ mt: 2.5 }}>
          <Button
            fullWidth
            variant="contained"
            disabled={busy || !steps.watched || !steps.workDone}
            onClick={() => act({ action: 'mark_caught_up' }, 'Marked as caught up.')}
            sx={{ textTransform: 'none', minHeight: 48, fontWeight: 700, borderRadius: RADIUS.control }}
          >
            Mark as caught up
          </Button>
          {(!steps.watched || !steps.workDone) && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}
            >
              Finish the steps above to enable this.
            </Typography>
          )}
        </Box>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.sev} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
