'use client';

/**
 * Your catch-up list.
 *
 * Two different debts land on this page and they are not the same conversation:
 *
 *   Classes you missed. You were enrolled, the class ran, you were not there.
 *   There is a reason to give, a deadline set by the timetable, and usually only
 *   one or two of them. These come first, always.
 *
 *   Classes taught before you joined. No reason to give, no fault, and possibly
 *   seventeen of them. Paced at a couple a week so the list reads as a path
 *   rather than a pile.
 *
 * Whatever the mix, exactly one thing is named as the next thing to do, in a
 * card at the top you cannot miss.
 *
 * Built at 375px first. On a phone everything stacks in one column; from md up
 * the hero and pace pin to a left rail so the lists can be read alongside them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import CatchupTrack, { TrackStep, TrackStepStatus } from '@/components/course-plan/CatchupTrack';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';

interface BacklogItem {
  id: string;
  scheduled_class_id: string;
  status: 'done' | 'current' | 'locked' | 'open' | 'excused' | 'pending_teacher';
  step: 'watch' | 'assignment' | 'test' | 'done';
  chained: boolean;
  position: number | null;
  due_on: string | null;
  overdue: boolean;
  reason_code: string | null;
  watched: boolean;
  assignments_outstanding: number;
  assignments_total: number;
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
  missedTotals: { total: number; completed: number; open: number; overdue: number };
  missed: BacklogItem[];
  items: BacklogItem[];
  excluded: Array<{ id: string; class: { title: string | null; scheduled_date: string } }>;
}

const STEP_COPY: Record<
  BacklogItem['step'],
  { label: string; cta: string; icon: typeof SmartDisplayOutlinedIcon }
> = {
  watch: { label: 'Watch the class', cta: 'Watch the class', icon: SmartDisplayOutlinedIcon },
  assignment: { label: 'Submit the assignment', cta: 'Open the assignment', icon: AssignmentOutlinedIcon },
  test: { label: 'Pass the class quiz', cta: 'Take the class quiz', icon: QuizOutlinedIcon },
  done: { label: 'Done', cta: 'Review', icon: CheckCircleIcon },
};

const REASON_LABEL: Record<string, string> = {
  unwell: 'Unwell',
  family: 'Family reasons',
  clash: 'Clashed with something',
  other: 'Other',
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

/** The deadline, said the way a person would say it. */
function dueLabel(item: BacklogItem): string | null {
  if (!item.due_on || item.status === 'done') return null;
  if (item.overdue) return `Was due ${formatDay(item.due_on)}`;
  return `Due before ${formatDay(item.due_on)}`;
}

const TRACK_STATUS: Record<BacklogItem['status'], TrackStepStatus> = {
  done: 'done',
  current: 'current',
  open: 'current',
  locked: 'locked',
  excused: 'excused',
  pending_teacher: 'pending',
};

/**
 * The three gates as three bars.
 *
 * The same shape appears on the teacher's screen, so "where is she stuck" reads
 * identically on both sides of the conversation.
 */
function Gates({ item }: { item: BacklogItem }) {
  const theme = useTheme();
  const gates = [
    { on: item.watched, now: item.step === 'watch', title: 'Watch the recording' },
    {
      on: item.assignments_total === 0 || item.assignments_outstanding === 0,
      now: item.step === 'assignment',
      title: 'Submit the assignment',
    },
    { on: !item.has_test || item.test_passed, now: item.step === 'test', title: 'Pass the class quiz' },
  ];

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {gates.map((g, i) => (
        <Box
          key={i}
          title={g.title}
          sx={{
            width: 26,
            height: 5,
            borderRadius: 99,
            bgcolor: g.on
              ? theme.palette.success.main
              : g.now
                ? theme.palette.primary.main
                : alpha(theme.palette.text.disabled, 0.35),
          }}
        />
      ))}
    </Stack>
  );
}

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
      setData({
        journey: null,
        pace: null,
        totals: null,
        missedTotals: { total: 0, completed: 0, open: 0, overdue: 0 },
        missed: [],
        items: [],
        excluded: [],
      });
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  /** Where an item's CTA goes. Straight to the step, not to a landing page. */
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

  const missedOpen = useMemo(
    () => (data?.missed || []).filter((i) => i.status !== 'done' && i.status !== 'excused'),
    [data],
  );
  const overdue = useMemo(() => missedOpen.filter((i) => i.overdue), [missedOpen]);

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

  const { items, missed, pace, totals, excluded } = data;
  const backlogCurrent = items.find((i) => i.status === 'current') || null;

  // The one thing to do next. A missed class outranks the backlog: it has a real
  // deadline and the course is about to move past it. Overdue outranks the rest.
  const current = overdue[0] || missedOpen[0] || backlogCurrent;
  const behind = pace?.state === 'behind';
  const nothingAtAll =
    missed.length === 0 && items.length === 0 && excluded.length === 0;

  if (nothingAtAll) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', textAlign: 'center', py: 8, px: 2 }}>
        <CheckCircleIcon sx={{ fontSize: 44, color: 'success.main', mb: 1.5 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Nothing to catch up on
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {offline
            ? 'You appear to be offline. Your list will load when you reconnect.'
            : 'You have not missed anything. Anything you do miss will show up here on its own.'}
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

  /** One missed class, as a tappable card. */
  const missedCard = (item: BacklogItem) => {
    const tone = item.status === 'done' ? 'success' : item.overdue ? 'error' : 'warning';
    const due = dueLabel(item);

    return (
      <Box
        key={item.id}
        component="button"
        type="button"
        onClick={() => openItem(item)}
        sx={{
          position: 'relative',
          display: 'block',
          width: '100%',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          p: 1.75,
          pl: 2.25,
          minHeight: 48,
          borderRadius: RADIUS.card,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          boxShadow: SHADOW.card,
          transition: 'border-color .16s ease, box-shadow .16s ease',
          '&:hover': { borderColor: 'primary.light', boxShadow: SHADOW.lift },
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 12,
            bottom: 12,
            width: 4,
            borderRadius: '0 4px 4px 0',
            bgcolor: `${tone}.main`,
          },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '.04em' }}
            >
              {formatDay(item.class.scheduled_date)}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.35, mt: 0.25 }}>
              {item.class.title || 'Class'}
            </Typography>
            {item.status === 'pending_teacher' ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Your teacher is still preparing this one.
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {item.status === 'done'
                  ? 'All three steps cleared.'
                  : item.reason_code
                    ? `You told us: ${(REASON_LABEL[item.reason_code] || item.reason_code).toLowerCase()}.`
                    : 'Tell us why, then watch it and finish the work.'}
              </Typography>
            )}
          </Box>
          <ChevronRightIcon sx={{ color: 'text.disabled' }} />
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}
          useFlexGap
        >
          <Gates item={item} />
          {item.status === 'done' ? (
            <Chip size="small" color="success" label="Caught up" sx={{ fontWeight: 700 }} />
          ) : due ? (
            <Chip
              size="small"
              color={item.overdue ? 'error' : 'warning'}
              variant={item.overdue ? 'filled' : 'outlined'}
              label={due}
              sx={{ fontWeight: 700 }}
            />
          ) : null}
        </Stack>
      </Box>
    );
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', pb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.25, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Catch-up
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Classes you were not in. Watch, finish the work, pass the quiz, and you are level again.
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
                borderColor: current.overdue ? 'error.main' : 'primary.main',
                bgcolor: alpha(
                  current.overdue ? theme.palette.error.main : theme.palette.primary.main,
                  0.04,
                ),
                boxShadow: SHADOW.card,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: current.overdue ? 'error.main' : 'primary.main',
                  mb: 0.75,
                }}
              >
                {current.overdue ? 'Overdue, do this first' : 'Do this next'}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25, mb: 0.25 }}>
                {current.class.title || 'Class'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {formatDay(current.class.scheduled_date)}
                {current.chained && totals
                  ? ` · class ${current.position} of ${totals.total}`
                  : dueLabel(current)
                    ? ` · ${dueLabel(current)?.toLowerCase()}`
                    : ''}
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
                        color: isDone ? 'success.dark' : isNow ? 'primary.dark' : 'text.secondary',
                      }}
                    />
                  );
                })}
              </Stack>

              <Button
                fullWidth
                variant="contained"
                color={current.overdue ? 'error' : 'primary'}
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

        <Box>
          {/* Missed classes first. They carry a deadline; the backlog does not. */}
          {overdue.length > 0 && (
            <>
              <Typography
                sx={{
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'error.main',
                  mb: 1,
                }}
              >
                Overdue
              </Typography>
              <Stack spacing={1} sx={{ mb: 3 }}>
                {overdue.map(missedCard)}
              </Stack>
            </>
          )}

          {missed.filter((i) => !i.overdue || i.status === 'done').length > 0 && (
            <>
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
                Classes you missed
              </Typography>
              <Stack spacing={1} sx={{ mb: 3 }}>
                {missed.filter((i) => !i.overdue || i.status === 'done').map(missedCard)}
              </Stack>
            </>
          )}

          {/* The backlog. Shown in full: hiding it would feel like being managed. */}
          {items.length > 0 && (
            <>
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
                Before you joined
              </Typography>

              <CatchupTrack
                steps={steps}
                lockFuture
                onStepClick={(_s, i) => openItem(items[i])}
                currentAction={() => (
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => backlogCurrent && openItem(backlogCurrent)}
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
            </>
          )}

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
