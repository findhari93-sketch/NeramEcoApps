'use client';

/**
 * Who is catching up, and who has stalled.
 *
 * Ordered by what a teacher can act on. "Needs attention" is first because it is
 * the only section with a decision in it. The full matrix is second, for when
 * someone asks "where exactly is she stuck". The classes nobody can catch up on
 * are last, because that is a content problem, not a student problem.
 *
 * The matrix is the one place in this feature that genuinely needs a wide table,
 * so below sm it is not a table at all: each student becomes an expandable card.
 * A student-by-class grid squeezed into 375px is unreadable, and the house rule
 * allows horizontal scroll only with a sticky first column, which still does not
 * make a twenty-column grid usable on a phone.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
  UserAvatar,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import { RADIUS } from '@/components/timetable/timetable-theme';

interface Item {
  id: string;
  scheduled_class_id: string;
  status: 'done' | 'current' | 'locked' | 'excused' | 'blocked' | 'pending_teacher';
  step: 'watch' | 'assignment' | 'test' | 'done';
  watched: boolean;
  assignments_outstanding: number;
  assignments_total: number;
  has_test: boolean;
  test_passed: boolean;
  excused: boolean;
}

interface Row {
  journey_id: string;
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  started_on: string;
  weekly_quota: number;
  totals: { total: number; completed: number; blocked: number; pendingTeacher: number };
  pace: { state: 'on_track' | 'behind' | 'done'; deficit: number; remaining: number };
  items: Item[];
}

interface Payload {
  classroomId: string | null;
  students: Row[];
  classes: Array<{ id: string; title: string | null; scheduled_date: string }>;
  noRecording: Array<{ id: string; title: string | null; scheduled_date: string; affected: number }>;
}

function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** The three gates as three dots, so a whole class reads at a glance. */
function Dots({ item }: { item: Item }) {
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
    { on: !item.has_test || item.test_passed, title: 'Test passed' },
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

export default function TeacherCatchUpPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [data, setData] = useState<Payload | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = (await authFetch('/api/catchup/overview')) as Payload;
      setData(res);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
      setData({ classroomId: null, students: [], classes: [], noRecording: [] });
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
              ? 'Excused. It has left their list and their pace.'
              : action === 'restore'
                ? 'Back on their list.'
                : 'Test reset. They can sit it again without rewatching.',
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
    async (studentId: string, journeyId: string) => {
      setBusy(studentId);
      try {
        await authFetch('/api/catchup/nudge', {
          method: 'POST',
          body: JSON.stringify({ studentIds: [studentId], journeyIds: [journeyId] }),
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

  if (data === null) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Skeleton variant="rounded" height={44} sx={{ borderRadius: 2, mb: 2, maxWidth: 260 }} />
        <Skeleton variant="rounded" height={160} sx={{ borderRadius: 3, mb: 2 }} />
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const behind = data.students.filter((s) => s.pace.state === 'behind');

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 6 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.25, fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
        Catch-up
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Students working through classes taught before they joined.
      </Typography>

      {data.students.length === 0 && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Nobody is catching up right now. A student who joins mid-course will show up here
          automatically.
        </Alert>
      )}

      {/* 1. The only section with a decision in it. */}
      {behind.length > 0 && (
        <Box sx={{ mb: 3.5 }}>
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'warning.dark',
              mb: 1,
            }}
          >
            Needs attention
          </Typography>
          <Stack spacing={1}>
            {behind.map((s) => (
              <Box
                key={s.journey_id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: RADIUS.control,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.warning.main, 0.4),
                  bgcolor: alpha(theme.palette.warning.main, 0.06),
                  flexWrap: 'wrap',
                }}
              >
                <UserAvatar src={s.student.avatar_url} name={s.student.name || ''} size={36} />
                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                    {s.student.name || s.student.email || 'Student'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.totals.completed} of {s.totals.total} done · {s.pace.deficit} behind
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy === s.student.id}
                  onClick={() => nudge(s.student.id, s.journey_id)}
                  sx={{ minHeight: 40, textTransform: 'none' }}
                >
                  Nudge
                </Button>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* 2. Where exactly is she stuck. */}
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
            Everyone
          </Typography>

          {isMobile ? (
            <Stack spacing={1}>
              {data.students.map((s) => {
                const open = expanded === s.journey_id;
                return (
                  <Box
                    key={s.journey_id}
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
                      onClick={() => setExpanded(open ? null : s.journey_id)}
                      onKeyDown={(e) => e.key === 'Enter' && setExpanded(open ? null : s.journey_id)}
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
                          {s.totals.completed} of {s.totals.total}
                          {s.pace.state === 'behind' ? ` · ${s.pace.deficit} behind` : ''}
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
                        {s.items.map((item) => {
                          const cls = data.classes.find((c) => c.id === item.scheduled_class_id);
                          return (
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
                                  {cls?.title || 'Class'}
                                </Typography>
                                <Typography variant="caption" color="text.disabled">
                                  {cls ? shortDate(cls.scheduled_date) : ''}
                                </Typography>
                              </Box>
                              <Dots item={item} />
                              <Button
                                size="small"
                                disabled={busy === item.id}
                                onClick={() => act(item.id, item.excused ? 'restore' : 'excuse')}
                                sx={{ textTransform: 'none', minHeight: 40, minWidth: 72 }}
                              >
                                {item.excused ? 'Restore' : 'Excuse'}
                              </Button>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
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
                        }}
                      >
                        {shortDate(c.scheduled_date)}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {data.students.map((s) => (
                    <Box component="tr" key={s.journey_id}>
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
                          <UserAvatar src={s.student.avatar_url} name={s.student.name || ''} size={28} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }} noWrap>
                              {s.student.name || s.student.email || 'Student'}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                              {s.totals.completed}/{s.totals.total}
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
                            }}
                          >
                            {item ? <Dots item={item} /> : null}
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

      {/* 3. A content problem, not a student problem. */}
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
            Cannot be caught up
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
                    {shortDate(c.scheduled_date)} · no recording
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
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            Add a recording to the class, then publish a recap, and these rejoin every affected
            student&apos;s list on their own.
          </Typography>
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
