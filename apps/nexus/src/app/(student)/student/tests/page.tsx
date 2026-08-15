'use client';

/**
 * A student's tests.
 *
 * Three tabs, one per concern that used to blur together on one long scroll:
 * Class Tests (what your teacher set, plus exams), My Tests (papers you built
 * yourself), My Performance (every score you have ever earned). The mistake
 * banner and the unfinished-attempt prompt sit above all three, because both
 * are time-sensitive and neither belongs to just one tab.
 *
 * Class prep and catch-up papers are deliberately not here. They are opened
 * from the class they gate, which is where their unlock rules live.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Box, Typography, Button, Paper, Skeleton, Alert, Snackbar, CircularProgress, Tabs, Tab } from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { pickUnexplainedAttempt } from '@/lib/unfinished-test-prompt';
import UnfinishedTestSheet, { type UnfinishedAttempt } from '@/components/tests/UnfinishedTestSheet';
import { type StudentTest } from '@/components/tests/StudentTestCard';
import MyTestsLibrary from '@/components/tests/MyTestsLibrary';
import TestsSection from '@/components/tests/TestsSection';
import ClassTestsTab, { type RecentAttempt } from '@/components/tests/ClassTestsTab';
import PerformanceTab, { type PerformanceTabData } from '@/components/tests/PerformanceTab';

interface Overview {
  due: StudentTest[];
  all?: StudentTest[];
  exams?: StudentTest[];
  has_classroom?: boolean;
  practice_groups: Array<{ key: string; label: string; tests: StudentTest[] }>;
  mine: StudentTest[];
  recent: RecentAttempt[];
  /**
   * Sittings this student walked away from and has not explained. Asked about
   * here because abandoning happens on page unload, where there is no UI to ask
   * anything. At most three, newest first.
   */
  needs_reason?: UnfinishedAttempt[];
}

type TabKey = 'class' | 'mine' | 'performance';
const TAB_KEYS: TabKey[] = ['class', 'mine', 'performance'];

export default function StudentTestsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  /**
   * Whether the student has already been asked about an abandoned attempt
   * this visit, one way or another. See the original comment history on this
   * flag: it is deliberately session state, never persisted.
   */
  const [askedThisVisit, setAskedThisVisit] = useState(false);

  const tabParam = searchParams.get('tab');
  const tab: TabKey = TAB_KEYS.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'class';
  const setTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'class') params.delete('tab');
      else params.set('tab', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // My Performance's payload is the one genuinely expensive read in this
  // feature, so it is fetched only the first time this tab is opened, not on
  // initial page load with everything else. Mirrors the teacher tests hub's
  // "By location" tab: gated on tab === 'performance' && data === null, so
  // switching away and back does not re-fetch.
  const [performanceData, setPerformanceData] = useState<PerformanceTabData | null>(null);
  const [performanceError, setPerformanceError] = useState<string | null>(null);

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
      setData({ due: [], all: [], exams: [], practice_groups: [], mine: [], recent: [], needs_reason: [] });
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

  useEffect(() => {
    if (tab !== 'performance' || performanceData !== null || performanceError) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch(`/api/student/tests/performance${classroomParam}`);
        if (!cancelled) setPerformanceData(json.data);
      } catch (err) {
        if (!cancelled) setPerformanceError(err instanceof Error ? err.message : 'Could not load your performance');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, performanceData, performanceError, authFetch, classroomParam]);

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
    () => pickUnexplainedAttempt(data?.needs_reason, askedThisVisit),
    [data, askedThisVisit],
  );

  const submitReason = useCallback(
    async (input: { attempt_id: string; reason_code: string; reason_note: string }) => {
      await authFetch('/api/student/tests/reasons', {
        method: 'POST',
        body: JSON.stringify({ ...input, classroom_id: activeClassroom?.id ?? null }),
      });
      setAskedThisVisit(true);
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

  // `all` already carries every teacher-set test, exams included, so this
  // does not need its own separate exams check.
  const nothingAtAll =
    data.due.length === 0 &&
    allTests.length === 0 &&
    totalPractice === 0 &&
    data.mine.length === 0 &&
    data.recent.length === 0;

  return (
    // My Tests gets the teacher-page's full width for its folder sidebar; the
    // other tabs are single-column content that stays readable narrower.
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: tab === 'mine' ? 1100 : 800, mx: 'auto', pb: 8 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.25 }}>
        Tests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Take a test as many times as you like. Your best score is the one that counts.
      </Typography>

      {nothingAtAll ? (
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
      ) : (
        <>
          {mistakeCount > 0 && (
            <Paper
              variant="outlined"
              sx={{ p: 2, mb: 3, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
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

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v as TabKey)}
            variant="fullWidth"
            sx={{
              mb: 3,
              minHeight: 44,
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600, fontSize: { xs: '0.8125rem', sm: '0.875rem' } },
            }}
          >
            <Tab label="Class Tests" value="class" />
            <Tab label="My Tests" value="mine" />
            <Tab label="My Performance" value="performance" />
          </Tabs>

          {tab === 'class' && (
            <ClassTestsTab
              data={{ due: data.due, all: allTests, exams: data.exams || [], practice_groups: data.practice_groups }}
              hasActiveClassroom={Boolean(activeClassroom?.id)}
              onStart={start}
              recentAttempt={data.recent[0]}
              onViewPerformance={() => setTab('performance')}
            />
          )}

          {tab === 'mine' && (
            <TestsSection
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
            </TestsSection>
          )}

          {tab === 'performance' && <PerformanceTab data={performanceData} error={performanceError} />}
        </>
      )}

      {/* Asked once per visit, one paper at a time, and always skippable. See
          UnfinishedTestSheet for why this lives here rather than at the moment
          the test was abandoned. Above every tab, not inside one: it is not
          about Class Tests, My Tests, or Performance specifically. */}
      <UnfinishedTestSheet attempt={askAbout} onDismiss={() => setAskedThisVisit(true)} onSubmit={submitReason} />

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
