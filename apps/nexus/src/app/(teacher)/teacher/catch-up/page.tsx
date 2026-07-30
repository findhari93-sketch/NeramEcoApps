'use client';

/**
 * Who missed a class and has not made it up.
 *
 * Built around the question actually being asked, which is not "show me the
 * data" but "who do I call today". So the default view is a list of people,
 * ordered by who needs the call first, with the phone number one tap away.
 *
 * Three tabs, in decreasing order of how often they are needed:
 *   Students  the chase list. Overdue pinned to the top.
 *   Classes   "did anyone actually watch Tuesday's recording".
 *   Blocked   classes with no recording or no published recap. A content
 *             problem, kept away from the student lists so it cannot be
 *             mistaken for one.
 *
 * The student-by-class matrix is the one thing here that genuinely needs a wide
 * table, so below sm it is not a table at all: each student becomes an
 * expandable card. A twenty column grid squeezed into 375px is unreadable, and
 * the house rule allows horizontal scroll only with a sticky first column, which
 * still does not make it usable on a phone.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
  UserAvatar,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import { RADIUS } from '@/components/timetable/timetable-theme';

interface Item {
  id: string;
  scheduled_class_id: string;
  kind: string;
  status: 'done' | 'current' | 'locked' | 'open' | 'excused' | 'blocked' | 'pending_teacher';
  step: 'watch' | 'assignment' | 'test' | 'done';
  chained: boolean;
  due_on: string | null;
  overdue: boolean;
  reason_code: string | null;
  watched: boolean;
  assignments_outstanding: number;
  assignments_total: number;
  has_test: boolean;
  test_passed: boolean;
  excused: boolean;
  class: { title: string | null; scheduled_date: string };
}

interface Row {
  journey_id: string | null;
  student: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  totals: { total: number; completed: number; blocked: number; pendingTeacher: number };
  missedTotals: { total: number; completed: number; open: number; overdue: number };
  pace: { state: 'on_track' | 'behind' | 'done'; deficit: number; remaining: number };
  items: Item[];
}

interface ClassStat {
  id: string;
  title: string | null;
  scheduled_date: string;
  present: number;
  missed: number;
  caughtUp: number;
  outstanding: number;
}

interface Payload {
  classroomId: string | null;
  students: Row[];
  classes: Array<{ id: string; title: string | null; scheduled_date: string }>;
  classStats: ClassStat[];
  noRecording: Array<{ id: string; title: string | null; scheduled_date: string; affected: number }>;
  pendingRecap: Array<{ id: string; title: string | null; scheduled_date: string; affected: number }>;
  totals: {
    studentsBehind: number;
    studentsCatchingUp: number;
    outstanding: number;
    clearedThisMonth: number;
  };
}

/** The reasons a student can give, in the words they picked them from. */
const REASON_LABEL: Record<string, string> = {
  unwell: 'Unwell',
  family: 'Family reasons',
  clash: 'Clashed with something',
  other: 'Other reason',
};

function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** One line summarising what a student owes. Kept in one place so it never drifts. */
function owedLine(s: Row): string {
  const parts: string[] = [];
  if (s.missedTotals.open > 0) parts.push(`${s.missedTotals.open} missed`);
  if (s.missedTotals.overdue > 0) parts.push(`${s.missedTotals.overdue} overdue`);
  const backlogOpen = s.totals.total - s.totals.completed;
  if (backlogOpen > 0) parts.push(`${backlogOpen} before joining`);
  return parts.length ? parts.join(' · ') : 'Nothing outstanding';
}

/** The three gates as three bars. Same shape the student sees. */
function Gates({ item }: { item: Item }) {
  const theme = useTheme();
  if (item.excused) {
    return (
      <Typography variant="caption" color="text.disabled">
        excused
      </Typography>
    );
  }
  if (item.status === 'blocked') {
    return (
      <Typography variant="caption" color="text.disabled">
        no rec
      </Typography>
    );
  }
  const gates = [
    { on: item.watched, title: 'Watched' },
    { on: item.assignments_total === 0 || item.assignments_outstanding === 0, title: 'Assignment in' },
    { on: !item.has_test || item.test_passed, title: 'Quiz passed' },
  ];
  return (
    <Stack direction="row" spacing={0.4} justifyContent="center">
      {gates.map((g, i) => (
        <Box
          key={i}
          title={g.title}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: g.on ? theme.palette.success.main : alpha(theme.palette.text.disabled, 0.35),
          }}
        />
      ))}
    </Stack>
  );
}

function StatTile({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone?: 'bad' | 'warn' | 'good';
}) {
  const theme = useTheme();
  const color =
    tone === 'bad'
      ? theme.palette.error.main
      : tone === 'warn'
        ? theme.palette.warning.dark
        : tone === 'good'
          ? theme.palette.success.main
          : theme.palette.text.primary;
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: RADIUS.card,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography
        sx={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}
      >
        {n}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function TeacherCatchUpPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<'students' | 'classes' | 'blocked'>('students');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = (await authFetch('/api/catchup/overview')) as Payload;
      setData(res);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
      setData({
        classroomId: null,
        students: [],
        classes: [],
        classStats: [],
        noRecording: [],
        pendingRecap: [],
        totals: { studentsBehind: 0, studentsCatchingUp: 0, outstanding: 0, clearedThisMonth: 0 },
      });
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const act = useCallback(
    async (itemId: string, action: 'excuse' | 'restore' | 'reset_test') => {
      setBusy(itemId);
      try {
        await authFetch(`/api/catchup/items/${itemId}`, {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
        setSnack({
          msg:
            action === 'excuse'
              ? 'Excused. It has left their list and their count.'
              : action === 'restore'
                ? 'Back on their list.'
                : 'Quiz reset. They can sit it again without rewatching.',
          sev: 'success',
        });
        await load();
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not save', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [authFetch, load],
  );

  const nudge = useCallback(
    async (studentId: string, journeyId: string | null) => {
      setBusy(studentId);
      try {
        await authFetch('/api/catchup/nudge', {
          method: 'POST',
          body: JSON.stringify({
            studentIds: [studentId],
            journeyIds: journeyId ? [journeyId] : [],
          }),
        });
        setSnack({ msg: 'Nudge sent.', sev: 'success' });
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not send', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [authFetch],
  );

  const needsAttention = useMemo(
    () => (data?.students || []).filter((s) => s.missedTotals.overdue > 0 || s.pace.state === 'behind'),
    [data],
  );
  const rest = useMemo(
    () => (data?.students || []).filter((s) => !needsAttention.includes(s)),
    [data, needsAttention],
  );

  if (data === null) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Skeleton variant="rounded" height={44} sx={{ borderRadius: 2, mb: 2, maxWidth: 260 }} />
        <Skeleton variant="rounded" height={90} sx={{ borderRadius: 3, mb: 2 }} />
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const blockedCount = data.noRecording.length + data.pendingRecap.length;

  /** One student, as a row with the actions a teacher actually takes. */
  const studentRow = (s: Row, flagged: boolean) => (
    <Box
      key={s.student.id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: RADIUS.control,
        border: '1px solid',
        borderColor: flagged ? alpha(theme.palette.error.main, 0.4) : 'divider',
        bgcolor: flagged ? alpha(theme.palette.error.main, 0.05) : 'background.paper',
        flexWrap: 'wrap',
      }}
    >
      <UserAvatar src={s.student.avatar_url} name={s.student.name || ''} size={38} />
      <Box sx={{ flex: 1, minWidth: 140 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
          {s.student.name || s.student.email || 'Student'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {owedLine(s)}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.75}>
        {s.student.phone && (
          <Button
            size="small"
            variant="outlined"
            href={`tel:${s.student.phone}`}
            startIcon={<PhoneOutlinedIcon />}
            sx={{ minHeight: 40, textTransform: 'none' }}
          >
            Call
          </Button>
        )}
        <Button
          size="small"
          variant="contained"
          disabled={busy === s.student.id}
          onClick={() => nudge(s.student.id, s.journey_id)}
          sx={{ minHeight: 40, textTransform: 'none' }}
        >
          Nudge
        </Button>
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 6 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.25, fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
        Catch-up
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Every student who missed a class and has not finished it yet. Sorted by who needs the call
        first.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
          mb: 1,
        }}
      >
        <StatTile n={data.totals.studentsBehind} label="need attention" tone="bad" />
        <StatTile n={data.totals.studentsCatchingUp} label="catching up" tone="warn" />
        <StatTile n={data.totals.outstanding} label="classes outstanding" />
        <StatTile n={data.totals.clearedThisMonth} label="cleared this month" tone="good" />
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2, minHeight: 46 }}
      >
        <Tab
          value="students"
          label="Students"
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46 }}
        />
        <Tab
          value="classes"
          label="Classes"
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46 }}
        />
        <Tab
          value="blocked"
          label={blockedCount > 0 ? `Cannot be caught up (${blockedCount})` : 'Cannot be caught up'}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46 }}
        />
      </Tabs>

      {/* ── Students ──────────────────────────────────────────────────────── */}
      {tab === 'students' && (
        <>
          {data.students.length === 0 && (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Nobody is behind. Every student has cleared the classes they missed.
            </Alert>
          )}

          {needsAttention.length > 0 && (
            <Box sx={{ mb: 3.5 }}>
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
                Call these first
              </Typography>
              <Stack spacing={1}>{needsAttention.map((s) => studentRow(s, true))}</Stack>
            </Box>
          )}

          {rest.length > 0 && (
            <Box sx={{ mb: 3.5 }}>
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
                Everyone else catching up
              </Typography>
              <Stack spacing={1}>{rest.map((s) => studentRow(s, false))}</Stack>
            </Box>
          )}

          {data.students.length > 0 && (
            <Box sx={{ mb: 3.5 }}>
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
                Where each one is stuck
              </Typography>

              {isMobile ? (
                <Stack spacing={1}>
                  {data.students.map((s) => {
                    const open = expanded === s.student.id;
                    return (
                      <Box
                        key={s.student.id}
                        sx={{
                          borderRadius: RADIUS.control,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                        }}
                      >
                        <Box
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpanded(open ? null : s.student.id)}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && setExpanded(open ? null : s.student.id)
                          }
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            p: 1.5,
                            minHeight: 56,
                            cursor: 'pointer',
                          }}
                        >
                          <UserAvatar src={s.student.avatar_url} name={s.student.name || ''} size={32} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }} noWrap>
                              {s.student.name || s.student.email || 'Student'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {owedLine(s)}
                            </Typography>
                          </Box>
                          <ExpandMoreIcon
                            sx={{
                              color: 'text.disabled',
                              transform: open ? 'rotate(180deg)' : 'none',
                              transition: 'transform 200ms ease',
                            }}
                          />
                        </Box>
                        <Collapse in={open} unmountOnExit>
                          <Stack spacing={0.5} sx={{ px: 1.5, pb: 1.5 }}>
                            {s.items.map((item) => (
                              <Box
                                key={item.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  py: 0.75,
                                  borderTop: '1px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                    {item.class.title || 'Class'}
                                  </Typography>
                                  {/* Everything worth saying out loud on the call:
                                      when it was, what they said, and how late it is. */}
                                  <Typography
                                    variant="caption"
                                    color={item.overdue ? 'error.main' : 'text.disabled'}
                                    sx={{ display: 'block' }}
                                  >
                                    {shortDate(item.class.scheduled_date)}
                                    {item.reason_code ? ` · ${REASON_LABEL[item.reason_code] || item.reason_code}` : ''}
                                    {item.overdue
                                      ? ` · overdue since ${item.due_on ? shortDate(item.due_on) : 'the next class'}`
                                      : item.due_on
                                        ? ` · due ${shortDate(item.due_on)}`
                                        : ''}
                                  </Typography>
                                </Box>
                                <Gates item={item} />
                                <Button
                                  size="small"
                                  disabled={busy === item.id}
                                  onClick={() => act(item.id, item.excused ? 'restore' : 'excuse')}
                                  sx={{ textTransform: 'none', minHeight: 40, minWidth: 72 }}
                                >
                                  {item.excused ? 'Restore' : 'Excuse'}
                                </Button>
                              </Box>
                            ))}
                          </Stack>
                        </Collapse>
                      </Box>
                    );
                  })}
                </Stack>
              ) : (
                <Box
                  sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                >
                  <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                    <Box component="thead">
                      <Box component="tr">
                        <Box
                          component="th"
                          sx={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 2,
                            bgcolor: 'background.paper',
                            textAlign: 'left',
                            p: 1.25,
                            minWidth: 190,
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            fontSize: '0.75rem',
                          }}
                        >
                          Student
                        </Box>
                        {data.classes.map((c) => (
                          <Box
                            key={c.id}
                            component="th"
                            title={c.title || ''}
                            sx={{
                              p: 1.25,
                              minWidth: 92,
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              whiteSpace: 'nowrap',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {shortDate(c.scheduled_date)}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {data.students.map((s) => (
                        <Box component="tr" key={s.student.id}>
                          <Box
                            component="td"
                            sx={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              bgcolor: 'background.paper',
                              p: 1.25,
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Stack direction="row" spacing={1} alignItems="center">
                              <UserAvatar
                                src={s.student.avatar_url}
                                name={s.student.name || ''}
                                size={28}
                              />
                              <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }} noWrap>
                                  {s.student.name || s.student.email || 'Student'}
                                </Typography>
                                <Typography variant="caption" color="text.disabled">
                                  {s.missedTotals.completed + s.totals.completed}/
                                  {s.missedTotals.total + s.totals.total}
                                </Typography>
                              </Box>
                            </Stack>
                          </Box>
                          {data.classes.map((c) => {
                            const item = s.items.find((i) => i.scheduled_class_id === c.id);
                            return (
                              <Box
                                key={c.id}
                                component="td"
                                sx={{
                                  p: 1.25,
                                  textAlign: 'center',
                                  borderBottom: '1px solid',
                                  borderColor: 'divider',
                                  bgcolor: item?.overdue
                                    ? alpha(theme.palette.error.main, 0.06)
                                    : 'transparent',
                                }}
                              >
                                {item ? <Gates item={item} /> : null}
                              </Box>
                            );
                          })}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </>
      )}

      {/* ── Classes ───────────────────────────────────────────────────────── */}
      {tab === 'classes' && (
        <Stack spacing={1}>
          {data.classStats.length === 0 && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No class has anyone outstanding against it.
            </Alert>
          )}
          {data.classStats.map((c) => {
            const total = c.present + c.missed;
            const clearedPct = total > 0 ? ((c.present + c.caughtUp) / total) * 100 : 0;
            const outstandingPct = total > 0 ? (c.outstanding / total) * 100 : 0;
            return (
              <Box
                key={c.id}
                sx={{
                  p: 1.75,
                  borderRadius: RADIUS.card,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {shortDate(c.scheduled_date)}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                      {c.title || 'Class'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.present} present · {c.missed} missed · {c.caughtUp} caught up
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    color={c.outstanding > 0 ? 'warning' : 'success'}
                    label={c.outstanding > 0 ? `${c.outstanding} outstanding` : 'All clear'}
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
                <Box
                  sx={{
                    display: 'flex',
                    height: 8,
                    borderRadius: 99,
                    overflow: 'hidden',
                    bgcolor: alpha(theme.palette.text.disabled, 0.12),
                    mt: 1.25,
                  }}
                >
                  <Box sx={{ width: `${clearedPct}%`, bgcolor: 'success.main' }} />
                  <Box sx={{ width: `${outstandingPct}%`, bgcolor: 'error.main' }} />
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* ── Cannot be caught up ───────────────────────────────────────────── */}
      {tab === 'blocked' && (
        <Box>
          {blockedCount === 0 ? (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Every class anyone missed has a recording and a published recap.
            </Alert>
          ) : (
            <Alert severity="info" sx={{ borderRadius: 2, mb: 2.5 }}>
              These hold nobody back and count for nobody. They are a content gap, not a student
              problem. Publish a recap and every affected student gets the class back on their list
              on its own.
            </Alert>
          )}

          {data.pendingRecap.length > 0 && (
            <Box sx={{ mb: 3 }}>
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
                Waiting on a recap
              </Typography>
              <Stack spacing={0.75}>
                {data.pendingRecap.map((c) => (
                  <Box
                    key={c.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      p: 1.5,
                      borderRadius: RADIUS.control,
                      border: '1px solid',
                      borderColor: 'divider',
                      flexWrap: 'wrap',
                    }}
                  >
                    <PendingActionsOutlinedIcon sx={{ fontSize: 20, color: 'warning.dark' }} />
                    <Box sx={{ flex: 1, minWidth: 140 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {c.title || 'Class'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {shortDate(c.scheduled_date)} · recording ready, recap not published ·{' '}
                        {c.affected} affected
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      href="/teacher/class-recaps"
                      sx={{ minHeight: 40, textTransform: 'none' }}
                    >
                      Review
                    </Button>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {data.noRecording.length > 0 && (
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
                No recording at all
              </Typography>
              <Stack spacing={0.75}>
                {data.noRecording.map((c) => (
                  <Box
                    key={c.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      p: 1.5,
                      borderRadius: RADIUS.control,
                      border: '1px dashed',
                      borderColor: 'divider',
                      flexWrap: 'wrap',
                    }}
                  >
                    <VideocamOffOutlinedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
                    <Box sx={{ flex: 1, minWidth: 140 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {c.title || 'Class'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {shortDate(c.scheduled_date)} · nothing to watch
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={`${c.affected} affected`}
                      sx={{ fontWeight: 700, bgcolor: alpha('#1A2027', 0.06) }}
                    />
                  </Box>
                ))}
              </Stack>
            </Box>
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
