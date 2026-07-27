'use client';

/**
 * Your catch-up list.
 *
 * A student who joins in month four owes seventeen classes. The screen is built
 * around one idea: however long the list is, there is exactly one thing to do
 * next, and it is at the top in a card you cannot miss.
 *
 * Everything below that hero is context, not instruction. The backlog is shown
 * in full (hiding it would feel like being managed) but only one row is ever
 * open, so the list reads as a path rather than a pile.
 *
 * Built at 375px first. On a phone the hero, the pace strip and the list stack
 * in one column; from md up the hero and pace pin to a left rail so the backlog
 * can be read alongside them.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import CatchupTrack, { TrackStep, TrackStepStatus } from '@/components/course-plan/CatchupTrack';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';

interface BacklogItem {
  id: string;
  scheduled_class_id: string;
  status: 'done' | 'current' | 'locked' | 'excused' | 'pending_teacher';
  step: 'watch' | 'assignment' | 'test' | 'done';
  position: number | null;
  due_on: string | null;
  assignments_outstanding: number;
  has_test: boolean;
  test_passed: boolean;
  recap_id: string | null;
  class: { id: string; title: string | null; scheduled_date: string; has_recording: boolean };
}

interface Payload {
  journey: { id: string; started_on: string; weekly_quota: number; status: string } | null;
  pace: {
    state: 'on_track' | 'behind' | 'done';
    deficit: number;
    remaining: number;
    finish_by: string | null;
    message: string;
  } | null;
  totals: { total: number; completed: number; blocked: number; pendingTeacher: number } | null;
  items: BacklogItem[];
  excluded: Array<{ id: string; class: { title: string | null; scheduled_date: string } }>;
}

const STEP_COPY: Record<BacklogItem['step'], { label: string; cta: string; icon: typeof SmartDisplayOutlinedIcon }> = {
  watch: { label: 'Watch the class', cta: 'Watch the class', icon: SmartDisplayOutlinedIcon },
  assignment: { label: 'Submit the assignment', cta: 'Open the assignment', icon: AssignmentOutlinedIcon },
  test: { label: 'Pass the class test', cta: 'Take the class test', icon: QuizOutlinedIcon },
  done: { label: 'Done', cta: 'Review', icon: CheckCircleIcon },
};

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shortDay(ymd: string | null): string | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}

const TRACK_STATUS: Record<BacklogItem['status'], TrackStepStatus> = {
  done: 'done',
  current: 'current',
  locked: 'locked',
  excused: 'excused',
  pending_teacher: 'pending',
};

export default function StudentCatchUpPage() {
  const router = useRouter();
  const theme = useTheme();
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [data, setData] = useState<Payload | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = (await authFetch('/api/student/catchup-journey')) as Payload;
      setData(res);
      setOffline(false);
    } catch (err) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setOffline(true);
      } else {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not load your list', sev: 'error' });
      }
      setData({ journey: null, pace: null, totals: null, items: [], excluded: [] });
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  /** Where the CTA for an item goes, which is always its per-class screen. */
  const openItem = useCallback(
    (item: BacklogItem) => {
      if (item.step === 'test' && item.has_test) {
        router.push(`/student/catch-up/${item.scheduled_class_id}/test`);
        return;
      }
      if (item.step === 'watch' && item.recap_id) {
        router.push(`/student/class-recap/${item.recap_id}`);
        return;
      }
      router.push(`/student/timetable/${item.scheduled_class_id}/catch-up`);
    },
    [router],
  );

  if (data === null) {
    return (
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2, mb: 2, maxWidth: 220 }} />
        <Skeleton variant="rounded" height={190} sx={{ borderRadius: 3, mb: 2 }} />
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 3 }} />
          ))}
        </Stack>
      </Box>
    );
  }

  const { items, pace, totals, excluded, journey } = data;
  const current = items.find((i) => i.status === 'current') || null;
  const behind = pace?.state === 'behind';

  if (!journey || (items.length === 0 && excluded.length === 0)) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', textAlign: 'center', py: 8, px: 2 }}>
        <CheckCircleIcon sx={{ fontSize: 44, color: 'success.main', mb: 1.5 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Nothing to catch up on
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {offline
            ? 'You appear to be offline. Your list will load when you reconnect.'
            : 'You are level with the class. Anything you miss from here will show up on this page.'}
        </Typography>
      </Box>
    );
  }

  const steps: TrackStep[] = items.map((i) => ({
    id: i.id,
    title: i.class.title || 'Class',
    description:
      i.status === 'pending_teacher'
        ? 'Your teacher is still preparing this one'
        : i.status === 'excused'
          ? 'Excused by your teacher'
          : `${formatDay(i.class.scheduled_date)}${i.status === 'current' ? ` · ${STEP_COPY[i.step].label}` : ''}`,
    done: i.status === 'done',
    status: TRACK_STATUS[i.status],
    label: i.position ?? '·',
  }));

  const CurrentIcon = current ? STEP_COPY[current.step].icon : SmartDisplayOutlinedIcon;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', pb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.25, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Catch-up
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Classes taught before you joined. Work through them in order, at your own pace.
      </Typography>

      {offline && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          You appear to be offline. This is the last list we loaded.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: { xs: '1fr', md: '380px 1fr' },
          alignItems: 'start',
        }}
      >
        {/* Left rail on desktop, top of the page on a phone. */}
        <Stack spacing={2} sx={{ position: { md: 'sticky' }, top: { md: 16 } }}>
          {current ? (
            <Box
              sx={{
                p: 2.25,
                borderRadius: RADIUS.card,
                border: '1.5px solid',
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                boxShadow: SHADOW.card,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'primary.main',
                  mb: 0.75,
                }}
              >
                Do this next
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25, mb: 0.25 }}>
                {current.class.title || 'Class'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {formatDay(current.class.scheduled_date)}
                {totals ? ` · class ${current.position} of ${totals.total}` : ''}
              </Typography>

              {/* Three steps, always in this order, so the shape of the work is
                  the same on every class. */}
              <Stack direction="row" spacing={0.75} sx={{ mb: 1.75, flexWrap: 'wrap' }} useFlexGap>
                {(['watch', 'assignment', 'test'] as const).map((s, idx) => {
                  const order = ['watch', 'assignment', 'test'];
                  const currentIdx = order.indexOf(current.step);
                  const isDone = current.step === 'done' || idx < currentIdx;
                  const isNow = current.step === s;
                  if (s === 'test' && !current.has_test) return null;
                  return (
                    <Chip
                      key={s}
                      size="small"
                      label={`${idx + 1}. ${STEP_COPY[s].label}`}
                      sx={{
                        fontWeight: isNow ? 700 : 500,
                        bgcolor: isDone
                          ? alpha(theme.palette.success.main, 0.12)
                          : isNow
                            ? alpha(theme.palette.primary.main, 0.12)
                            : alpha('#1A2027', 0.06),
                        color: isDone
                          ? 'success.dark'
                          : isNow
                            ? 'primary.dark'
                            : 'text.secondary',
                      }}
                    />
                  );
                })}
              </Stack>

              <Button
                fullWidth
                variant="contained"
                startIcon={<CurrentIcon />}
                onClick={() => openItem(current)}
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.control }}
              >
                {STEP_COPY[current.step].cta}
              </Button>
            </Box>
          ) : (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Every class on your list is done. Nice work.
            </Alert>
          )}

          {totals && totals.total > 0 && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={Math.round((totals.completed / totals.total) * 100)}
                sx={{ height: 8, borderRadius: 99, mb: 0.75 }}
              />
              <Typography variant="caption" color="text.secondary">
                {totals.completed} of {totals.total} classes done
                {pace?.finish_by && pace.remaining > 0 ? ` · finish by ${formatDay(pace.finish_by)}` : ''}
              </Typography>
            </Box>
          )}

          {pace && pace.state !== 'done' && (
            <Box
              sx={{
                px: 1.75,
                py: 1.25,
                borderRadius: RADIUS.control,
                border: '1px solid',
                borderColor: behind ? alpha(theme.palette.warning.main, 0.4) : 'divider',
                bgcolor: behind
                  ? alpha(theme.palette.warning.main, 0.08)
                  : alpha(theme.palette.success.main, 0.06),
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: behind ? 700 : 500 }}>
                {pace.message}
              </Typography>
            </Box>
          )}
        </Stack>

        {/* The backlog. Shown in full: hiding it would feel like being managed. */}
        <Box>
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'text.secondary',
              mb: 1,
            }}
          >
            Your backlog
          </Typography>

          <CatchupTrack
            steps={steps}
            lockFuture
            onStepClick={(_s, i) => openItem(items[i])}
            currentAction={() => (
              <Button
                size="small"
                variant="contained"
                onClick={() => current && openItem(current)}
                sx={{ minHeight: 40, textTransform: 'none', borderRadius: RADIUS.control }}
              >
                Start
              </Button>
            )}
            trailing={(_s, i) => {
              const item = items[i];
              if (item.status === 'locked' && item.due_on) {
                return (
                  <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                    due {shortDay(item.due_on)}
                  </Typography>
                );
              }
              return null;
            }}
          />

          {excluded.length > 0 && (
            <Box
              sx={{
                mt: 2,
                p: 1.75,
                borderRadius: RADIUS.control,
                border: '1px dashed',
                borderColor: 'divider',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <VideocamOffOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {excluded.length} {excluded.length === 1 ? 'class has' : 'classes have'} no recording
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.disabled">
                Nothing to do here, and they do not count against you. Your teacher can see them too.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

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
