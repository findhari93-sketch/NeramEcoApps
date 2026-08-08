'use client';

/**
 * A student's tests.
 *
 * Built around what a student actually opens the app to do, in that order:
 * finish what is due, practise the chapter they are on, run their own drills,
 * and see how they did. The old page was a flat list of everything, next to a
 * question bank of 1121 loose questions, which is not something anyone works
 * through.
 *
 * Class prep and catch-up papers are deliberately not here. They are opened from
 * the class they gate, which is where their unlock rules live.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Snackbar,
  Divider,
  LinearProgress,
  CircularProgress,
} from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import UnfinishedTestSheet, { type UnfinishedAttempt } from '@/components/tests/UnfinishedTestSheet';
import StudentTestCard, { formatWhen, type StudentTest, type TestStatus } from '@/components/tests/StudentTestCard';
import MyTestsLibrary from '@/components/tests/MyTestsLibrary';

interface Overview {
  due: StudentTest[];
  all?: StudentTest[];
  has_classroom?: boolean;
  practice_groups: Array<{ key: string; label: string; tests: StudentTest[] }>;
  mine: StudentTest[];
  recent: Array<{
    attempt_id: string;
    test_id: string;
    test_title: string;
    attempt_number: number;
    percentage: number | null;
    passed: boolean | null;
    submitted_at: string | null;
  }>;
  /**
   * Sittings this student walked away from and has not explained. Asked about
   * here because abandoning happens on page unload, where there is no UI to ask
   * anything. At most three, newest first.
   */
  needs_reason?: UnfinishedAttempt[];
}

const STATUS_FILTERS: Array<{ key: TestStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'To do' },
  { key: 'upcoming', label: 'Coming up' },
  { key: 'done', label: 'Done' },
  { key: 'closed', label: 'Closed' },
];

function Section({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}

export default function StudentTestsPage() {
  const router = useRouter();
  const { getToken, activeClassroom, loading: authLoading } = useNexusAuthContext() as any;

  const [data, setData] = useState<Overview | null>(null);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [buildingMistakes, setBuildingMistakes] = useState(false);
  /**
   * One Snackbar for both outcomes.
   *
   * My tests can now change things rather than only list them, and a delete or a
   * move that reports nothing at all reads as a delete that did not work: the
   * student presses it again. Success is as worth saying as failure.
   */
  const [notice, setNotice] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const notify = useCallback(
    (message: string, severity: 'success' | 'error') => setNotice({ message, severity }),
    [],
  );
  const setError = useCallback((message: string) => setNotice({ message, severity: 'error' }), []);
  const [statusFilter, setStatusFilter] = useState<TestStatus | 'all'>('all');
  /**
   * Attempts the student has waved away this visit.
   *
   * Held in component state rather than written to the server, deliberately.
   * "Not now" means not now, not never: the question comes back next visit,
   * which is the right cadence for something worth asking but not worth
   * demanding. Persisting a dismissal would silently turn one skipped tap into
   * permanent silence about a test that may well be broken.
   */
  const [dismissedReasons, setDismissedReasons] = useState<Set<string>>(new Set());

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Request failed');
      }
      return res.json();
    },
    [getToken],
  );

  const classroomParam = activeClassroom?.id ? `?classroom=${activeClassroom.id}` : '';

  const load = useCallback(async () => {
    try {
      const json = await authFetch(`/api/student/tests/overview${classroomParam}`);
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your tests');
      setData({ due: [], all: [], practice_groups: [], mine: [], recent: [], needs_reason: [] });
    }
    try {
      const m = await authFetch(`/api/student/tests/mistakes${classroomParam}`);
      setMistakeCount(m.data?.count || 0);
    } catch {
      // A missing mistakes count is not worth an error banner.
    }
  }, [authFetch, classroomParam, setError]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const start = useCallback(
    (t: StudentTest) => {
      const params = new URLSearchParams({ test_id: t.id });
      if (t.placement_id) params.set('placement_id', t.placement_id);
      router.push(`/student/tests/take?${params.toString()}`);
    },
    [router],
  );

  async function practiseMistakes() {
    setBuildingMistakes(true);
    try {
      const json = await authFetch('/api/student/tests/mistakes', {
        method: 'POST',
        body: JSON.stringify({ classroom_id: activeClassroom?.id ?? null }),
      });
      router.push(`/student/tests/take?test_id=${json.data.test_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build your practice test');
      setBuildingMistakes(false);
    }
  }

  /**
   * The one unexplained abandon we ask about right now.
   *
   * One at a time, newest first. The server sends up to three, but presenting
   * three sheets in a row to a student who has had a bad week is an
   * interrogation, not a question. Answering or dismissing this one reveals the
   * next on the following visit.
   */
  const askAbout = useMemo(
    () => (data?.needs_reason || []).find((a) => !dismissedReasons.has(a.attempt_id)) ?? null,
    [data, dismissedReasons],
  );

  const submitReason = useCallback(
    async (input: { attempt_id: string; reason_code: string; reason_note: string }) => {
      await authFetch('/api/student/tests/reasons', {
        method: 'POST',
        body: JSON.stringify({ ...input, classroom_id: activeClassroom?.id ?? null }),
      });
      // Drop it locally rather than reloading the whole page: the answer changes
      // nothing else on screen, and a full refetch would cost a student on a
      // phone a visible flash for no gain.
      setData((prev) =>
        prev
          ? { ...prev, needs_reason: (prev.needs_reason || []).filter((a) => a.attempt_id !== input.attempt_id) }
          : prev,
      );
    },
    [authFetch, activeClassroom?.id],
  );

  const totalPractice = useMemo(
    () => (data?.practice_groups || []).reduce((n, g) => n + g.tests.length, 0),
    [data],
  );

  const allTests = useMemo(() => data?.all || [], [data]);
  const visibleAllTests = useMemo(
    () => (statusFilter === 'all' ? allTests : allTests.filter((t) => t.status === statusFilter)),
    [allTests, statusFilter],
  );

  if (authLoading || data === null) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
        <Skeleton variant="text" width={140} height={38} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={150} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      </Box>
    );
  }

  const nothingAtAll =
    data.due.length === 0 &&
    allTests.length === 0 &&
    totalPractice === 0 &&
    data.mine.length === 0 &&
    data.recent.length === 0;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto', pb: 8 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.25 }}>
        Tests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Take a test as many times as you like. Your best score is the one that counts.
      </Typography>

      {nothingAtAll && (
        <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
          <AssignmentOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {/* Two very different situations that used to read identically. Only
                one of them is something the student can act on. */}
            {!activeClassroom?.id
              ? 'Pick your class at the top of the screen to see the tests set for it.'
              : 'No tests yet. Weekly tests, model tests and chapter tests appear here when your teacher sets one.'}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddOutlinedIcon />}
            onClick={() => router.push('/student/tests/new')}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Build your own practice test
          </Button>
        </Paper>
      )}

      {/* Rendered even when empty. Unmounting it is what made teacher-set tests
          look as though they did not exist: a student with nothing assigned saw
          no trace of the idea anywhere on the page. */}
      {!nothingAtAll && (
        <Section
          icon={<AssignmentOutlinedIcon />}
          title="Due now"
          subtitle="Set by your teacher, soonest first"
        >
          {data.due.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {!activeClassroom?.id
                  ? 'Pick your class at the top of the screen to see the tests set for it.'
                  : 'Nothing due right now. Weekly tests, model tests and chapter tests appear here when your teacher sets one.'}
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {data.due.map((t) => (
                <StudentTestCard key={t.id} test={t} onStart={start} emphasis />
              ))}
            </Box>
          )}
        </Section>
      )}

      {mistakeCount > 0 && (
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 4, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
        >
          <AutoFixHighOutlinedIcon sx={{ color: 'warning.main' }} />
          <Box sx={{ flex: 1, minWidth: 160 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Fix what you got wrong
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {mistakeCount} question{mistakeCount !== 1 ? 's' : ''} you missed and have not got right since
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={practiseMistakes}
            disabled={buildingMistakes}
            startIcon={buildingMistakes ? <CircularProgress size={15} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Practise these
          </Button>
        </Paper>
      )}

      {totalPractice > 0 && (
        <Section
          icon={<FitnessCenterOutlinedIcon />}
          title="Practice"
          subtitle="Grouped by chapter, take them whenever you like"
        >
          {data.practice_groups.map((g) => (
            <Box key={g.key} sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                {g.label}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {g.tests.map((t) => (
                  <StudentTestCard key={t.id} test={t} onStart={start} />
                ))}
              </Box>
            </Box>
          ))}
        </Section>
      )}

      {/* The consolidated record. Everything the class has had, closed included,
          so "did I miss one" has an answer. */}
      {allTests.length > 0 && (
        <Section
          icon={<ClassOutlinedIcon />}
          title="All class tests"
          subtitle={`Everything your teacher has set, ${allTests.length} in total`}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
            {STATUS_FILTERS.map((f) => {
              const n = f.key === 'all' ? allTests.length : allTests.filter((t) => t.status === f.key).length;
              if (n === 0 && f.key !== 'all') return null;
              return (
                <Chip
                  key={f.key}
                  label={`${f.label} (${n})`}
                  size="small"
                  color={statusFilter === f.key ? 'primary' : 'default'}
                  variant={statusFilter === f.key ? 'filled' : 'outlined'}
                  onClick={() => setStatusFilter(f.key)}
                  sx={{ height: 32, cursor: 'pointer' }}
                />
              );
            })}
          </Box>

          {visibleAllTests.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Nothing here with that filter.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {visibleAllTests.map((t) => (
                <StudentTestCard key={`${t.id}-${t.placement_id}`} test={t} onStart={start} />
              ))}
            </Box>
          )}
        </Section>
      )}

      <Section
        icon={<PersonOutlineOutlinedIcon />}
        title="My tests"
        subtitle="Papers you built yourself"
        action={
          <Button
            size="small"
            startIcon={<AddOutlinedIcon />}
            onClick={() => router.push('/student/tests/new')}
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            New
          </Button>
        }
      >
        <MyTestsLibrary
          tests={data.mine}
          onStart={start}
          authFetch={authFetch}
          onChanged={load}
          onNotify={notify}
          onNew={() => router.push('/student/tests/new')}
        />
      </Section>

      {data.recent.length > 0 && (
        <Section icon={<HistoryOutlinedIcon />} title="Recent results">
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {data.recent.map((r, i) => (
              <Box key={r.attempt_id}>
                {i > 0 && <Divider />}
                <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {r.test_title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Attempt {r.attempt_number} · {formatWhen(r.submitted_at)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={r.percentage == null ? '-' : `${Math.round(r.percentage)}%`}
                    color={r.passed === true ? 'success' : r.passed === false ? 'default' : 'primary'}
                    sx={{ height: 24, fontWeight: 700 }}
                  />
                </Box>
              </Box>
            ))}
          </Paper>
          <Button
            size="small"
            onClick={() => router.push('/student/tests/history')}
            sx={{ textTransform: 'none', mt: 1, minHeight: 40 }}
          >
            See all results
          </Button>
        </Section>
      )}

      {/* Asked once per visit, one paper at a time, and always skippable. See
          UnfinishedTestSheet for why this lives here rather than at the moment
          the test was abandoned. */}
      <UnfinishedTestSheet
        attempt={askAbout}
        onDismiss={() =>
          setDismissedReasons((prev) => {
            if (!askAbout) return prev;
            const next = new Set(prev);
            next.add(askAbout.attempt_id);
            return next;
          })
        }
        onSubmit={submitReason}
      />

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={notice?.severity === 'success' ? 4000 : 6000}
        onClose={() => setNotice(null)}
        // Above the mobile BottomNav, or a toast confirming a delete lands
        // underneath it and the student never learns the delete worked.
        sx={{ bottom: { xs: 72, sm: 24 } }}
      >
        <Alert severity={notice?.severity || 'error'} variant="filled" onClose={() => setNotice(null)}>
          {notice?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
