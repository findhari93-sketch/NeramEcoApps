'use client';

/**
 * Reconciling one class: who was expected, who actually joined, who to chase.
 *
 * Everyone is attending by default, so the interesting number is not "how many
 * came" but "how many were down as coming and did not, without saying why".
 * That is the only group that needs a person to do something, so it is the one
 * the screen leads with.
 *
 * Sending is deliberately a button a teacher presses. The 9 PM cron draws up
 * the list and stops there.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SyncIcon from '@mui/icons-material/Sync';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RSVP_REASONS } from '@/lib/rsvp-reasons';
import { RADIUS, SHADOW, tagSx } from '@/components/timetable/timetable-theme';
import { formatTime } from '@/components/timetable/date-utils';

interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  present: boolean;
  joined_at: string | null;
  late_by_minutes: number | null;
  absence: {
    kind: 'no_show' | 'opted_out';
    reason_code: string | null;
    reason_note: string | null;
    followup_sent_at: string | null;
    caught_up_at: string | null;
    recording_watched_at: string | null;
  } | null;
}

interface FollowupData {
  class: {
    id: string;
    classroom_id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
  };
  students: StudentRow[];
  stats: {
    rosterSize: number;
    present: number;
    lateJoiners: number;
    optedOut: number;
    unexplained: number;
    awaitingFollowup: number;
  };
  attachments: { hasRecording: boolean; assignments: Array<{ id: string; title: string }> };
}

function reasonLabel(code: string | null): string {
  return RSVP_REASONS.find((r) => r.code === code)?.shortLabel || 'Reason given';
}

export default function ClassReconciliationPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { getToken, getTeacherToken } = useNexusAuthContext();

  const [data, setData] = useState<FollowupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [viaTeams, setViaTeams] = useState(true);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/followup`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Could not load this class.');
        return;
      }
      setData(body);
      setError(null);
    } catch {
      setError('Could not load this class.');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Pulling fresh attendance needs the teacher's own token: the Graph endpoint
   * is delegated, which is exactly why the nightly cron cannot do it.
   */
  const syncTeams = async () => {
    if (!data) return;
    setSyncing(true);
    try {
      const token = await getTeacherToken();
      if (!token) {
        setSnack({ msg: 'Sign in again to read the Teams attendance report.', sev: 'error' });
        return;
      }
      const res = await fetch('/api/timetable/attendance-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: data.class.classroom_id,
          action: 'sync_teams',
        }),
      });
      const body = await res.json().catch(() => ({}));
      setSnack({
        msg: res.ok ? body.message || 'Synced from Teams.' : body.error || 'Could not sync',
        sev: res.ok ? 'success' : 'error',
      });
      if (res.ok) await load();
    } catch {
      setSnack({ msg: 'Could not sync from Teams', sev: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const noShows = useMemo(
    () => (data?.students || []).filter((s) => s.absence?.kind === 'no_show'),
    [data],
  );

  const openDialog = (ids: string[]) => {
    if (!data) return;
    setSelected(ids);
    setMessage(
      `We missed you in "${data.class.title}". Tap to tell us why, then watch the recording and finish the assignment.`,
    );
    setDialogOpen(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ student_ids: selected, message, teams: viaTeams }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSnack({
          msg:
            body.teamsDelivered > 0
              ? `Sent to ${body.sent}. ${body.teamsDelivered} reached on Teams.`
              : `Sent to ${body.sent}, in the app.`,
          sev: 'success',
        });
        setDialogOpen(false);
        await load();
      } else {
        setSnack({ msg: body.error || 'Could not send', sev: 'error' });
      }
    } catch {
      setSnack({ msg: 'Could not send', sev: 'error' });
    } finally {
      setSending(false);
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
      <Box sx={{ p: 3, maxWidth: 860, mx: 'auto' }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
      </Box>
    );
  }

  const { stats, students } = data;

  const statCard = (label: string, value: number, alarming = false) => (
    <Box
      key={label}
      sx={{
        flex: '1 1 130px',
        p: 1.75,
        borderRadius: RADIUS.card,
        border: `1px solid ${alarming && value > 0 ? theme.palette.error.main : theme.palette.divider}`,
        bgcolor: 'background.paper',
        textAlign: 'center',
      }}
    >
      <Typography
        variant="h5"
        sx={{ fontWeight: 800, color: alarming && value > 0 ? 'error.main' : 'text.primary' }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto', pb: 8 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/teacher/attendance')}
        sx={{ textTransform: 'none', minHeight: 44, ml: -1, mb: 1 }}
      >
        Back to attendance
      </Button>

      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
            {data.class.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {data.class.scheduled_date}, {formatTime(data.class.start_time)} to{' '}
            {formatTime(data.class.end_time)}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={syncTeams}
          disabled={syncing}
          sx={{ textTransform: 'none', minHeight: 44, whiteSpace: 'nowrap' }}
        >
          {syncing ? 'Syncing...' : 'Sync from Teams'}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Teams marks who joined. Everyone is attending by default, so reconcile the gaps.
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        {statCard('Joined', stats.present)}
        {statCard('Late', stats.lateJoiners)}
        {statCard('Told you first', stats.optedOut)}
        {statCard('No reason given', stats.unexplained, true)}
      </Stack>

      {stats.awaitingFollowup > 0 && (
        <Box
          sx={{
            p: 2,
            mb: 2,
            borderRadius: RADIUS.card,
            bgcolor: alpha(theme.palette.error.main, 0.06),
            border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
          }}
        >
          <Typography sx={{ fontWeight: 700, color: 'error.dark' }}>
            {stats.awaitingFollowup === 1
              ? '1 student was down as attending but never joined'
              : `${stats.awaitingFollowup} students were down as attending but never joined`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            A follow-up asks for their reason and points them at the recording and the assignment.
          </Typography>
          <Button
            variant="contained"
            color="error"
            onClick={() =>
              openDialog(noShows.filter((s) => !s.absence?.followup_sent_at).map((s) => s.id))
            }
            sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700 }}
          >
            Follow up with {stats.awaitingFollowup}
          </Button>
        </Box>
      )}

      <Stack spacing={0.875}>
        {students.map((s) => {
          const isNoShow = s.absence?.kind === 'no_show';
          const explained = !!s.absence?.reason_code;
          return (
            <Box
              key={s.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                p: 1.5,
                minHeight: 64,
                borderRadius: RADIUS.card,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor:
                  isNoShow && !explained ? alpha(theme.palette.error.main, 0.04) : 'background.paper',
                boxShadow: SHADOW.card,
                flexWrap: 'wrap',
              }}
            >
              <Avatar src={s.avatar_url || undefined} sx={{ width: 34, height: 34 }}>
                {s.name.charAt(0)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }} noWrap>
                  {s.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.present
                    ? s.late_by_minutes
                      ? `Joined ${s.late_by_minutes} min late`
                      : 'Joined on time'
                    : s.absence?.kind === 'opted_out'
                      ? `Said in advance, ${reasonLabel(s.absence.reason_code).toLowerCase()}`
                      : explained
                        ? `Answered, ${reasonLabel(s.absence!.reason_code).toLowerCase()}`
                        : 'No reason given'}
                </Typography>
              </Box>

              <Stack direction="row" spacing={0.625} alignItems="center" flexWrap="wrap">
                {s.present && (
                  <Box component="span" sx={tagSx(theme, 'success')}>
                    Present
                  </Box>
                )}
                {s.late_by_minutes !== null && (
                  <Box component="span" sx={tagSx(theme, 'neutral')}>
                    Late
                  </Box>
                )}
                {explained && !s.present && (
                  <Box component="span" sx={tagSx(theme, 'success')}>
                    {reasonLabel(s.absence!.reason_code)}
                  </Box>
                )}
                {s.absence?.caught_up_at && (
                  <Box component="span" sx={tagSx(theme, 'success')}>
                    Caught up
                  </Box>
                )}
                {isNoShow && !s.absence?.caught_up_at && (
                  s.absence?.followup_sent_at ? (
                    <Box component="span" sx={tagSx(theme, 'neutral')}>
                      Notified
                    </Box>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => openDialog([s.id])}
                      sx={{ textTransform: 'none', minHeight: 40 }}
                    >
                      Follow up
                    </Button>
                  )
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>

      {/* Follow-up */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={!isDesktop}
      >
        <DialogTitle sx={{ pb: 0.5, fontWeight: 800 }}>
          Follow up, {selected.length} {selected.length === 1 ? 'student' : 'students'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {data.class.title}, {data.class.scheduled_date}
          </Typography>

          <Stack direction="row" spacing={0.625} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            {students
              .filter((s) => selected.includes(s.id))
              .map((s) => (
                <Box key={s.id} component="span" sx={tagSx(theme, 'neutral')}>
                  {s.name}
                </Box>
              ))}
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.5 }}
          >
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                Teams notification
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Through the Neram Assistant app
              </Typography>
            </Box>
            <Switch checked={viaTeams} onChange={(e) => setViaTeams(e.target.checked)} />
          </Stack>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                In-app notification
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Always sent, it is the durable record
              </Typography>
            </Box>
            <Checkbox checked disabled />
          </Stack>

          <TextField
            label="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            size="small"
          />

          <Stack direction="row" spacing={0.625} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.disabled" sx={{ width: '100%' }}>
              Attached automatically
            </Typography>
            {data.attachments.hasRecording && (
              <Box component="span" sx={tagSx(theme, 'primary')}>
                Recording
              </Box>
            )}
            {data.attachments.assignments.map((a) => (
              <Box key={a.id} component="span" sx={tagSx(theme, 'primary')}>
                {a.title}
              </Box>
            ))}
            {!data.attachments.hasRecording && data.attachments.assignments.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                Nothing yet. They will still be asked for a reason.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ minHeight: 44, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={send}
            disabled={sending || selected.length === 0}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
          >
            {sending ? 'Sending...' : 'Send follow-up'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={5000}
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
