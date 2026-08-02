'use client';

/**
 * The catch-up workspace: one place for everything about a class a student did
 * not sit through.
 *
 * It answers four questions, in the order they get asked:
 *   Needs action        who do I call today
 *   Reasons             why did they miss it, in their own words
 *   Caught up           which of them finished
 *   Classes and recaps  what do I still owe them, and the button that fixes it
 *
 * The last tab absorbed the whole /teacher/class-recaps list page. Those were
 * two screens telling a teacher about the same debt: one said "this class has no
 * published recap and it is blocking four students", the other said "this class
 * has a recording, here is a Create recap button", and neither said both. The
 * recap editor itself is untouched and still lives at
 * /teacher/class-recaps/[recapId].
 *
 * This page is now a shell: it fetches once and hands the payload to a tab. The
 * tabs live in components/catchup/ so no one file has to hold all four.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Skeleton, Snackbar, Tab, Tabs, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useAuthSWR } from '@/lib/nexus-swr';
import { StatTile } from '@/components/catchup/shared';
import NeedsActionTab from '@/components/catchup/NeedsActionTab';
import ReasonsTab from '@/components/catchup/ReasonsTab';
import CaughtUpTab from '@/components/catchup/CaughtUpTab';
import ClassesRecapsTab from '@/components/catchup/ClassesRecapsTab';
import type { ItemAction, Payload, TabProps } from '@/components/catchup/types';

type TabKey = 'students' | 'reasons' | 'caught-up' | 'classes';

const TAB_KEYS: TabKey[] = ['students', 'reasons', 'caught-up', 'classes'];

const EMPTY: Payload = {
  classroomId: null,
  students: [],
  classes: [],
  classStats: [],
  reasons: [],
  reasonTally: {},
  completed: [],
  noRecording: [],
  pendingRecap: [],
  totals: {
    studentsBehind: 0,
    studentsCatchingUp: 0,
    outstanding: 0,
    clearedThisMonth: 0,
    explained: 0,
    unexplained: 0,
  },
};

function TeacherCatchUpWorkspace() {
  const searchParams = useSearchParams();
  const { loading: authLoading, activeClassroom } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  // The tab lives in the URL so a notification can deep-link straight to the
  // reasons feed and a teacher can bookmark the view they actually use. Read
  // once, into state.
  //
  // The URL is then kept in step with history.replaceState rather than
  // router.replace. router.replace treats a query change as a navigation and
  // fetches an RSC payload for a page that is entirely client rendered: a server
  // round trip per tap that renders nothing new, and one that threw a
  // fetchServerResponse error under test. This keeps the shareable URL and
  // makes the tabs instant.
  const initialTab = searchParams.get('tab') as TabKey | null;
  const [tab, setTabState] = useState<TabKey>(
    initialTab && TAB_KEYS.includes(initialTab) ? initialTab : 'students',
  );

  const setTab = useCallback((next: TabKey) => {
    setTabState(next);
    window.history.replaceState(
      null,
      '',
      next === 'students' ? '/teacher/catch-up' : `/teacher/catch-up?tab=${next}`,
    );
  }, []);

  // Follow the classroom switcher. Without this the route falls back to the newest
  // active classroom, which is not necessarily the one the teacher is looking at:
  // classrooms are per academic year, and the Class Recaps page this tab absorbed was
  // classroom-aware, so dropping it would have been a regression rather than a
  // simplification.
  //
  // The classroom id is part of the key rather than a manual refetch, so switching
  // classroom looks up a different cache entry instead of clearing this one. A
  // classroom the teacher has already opened comes back instantly.
  //
  // Held until auth settles: a request fired before there is a token 401s, and the
  // null key is how SWR is told to wait.
  const key = authLoading
    ? null
    : `/api/catchup/overview${activeClassroom?.id ? `?classroomId=${activeClassroom.id}` : ''}`;

  const { data: fetched, error, mutate } = useAuthSWR<Payload>(key);

  // On a revisit `fetched` is already populated from the persisted cache, so the
  // skeleton below is never reached and the teacher lands on real rows.
  //
  // Falling back to EMPTY on an error keeps the previous behaviour: the page shows its
  // empty state next to the error snackbar, rather than a skeleton that never resolves.
  const data = fetched ?? (error ? EMPTY : null);

  useEffect(() => {
    if (error) {
      setSnack({ msg: error.message || 'Failed to load', sev: 'error' });
    }
  }, [error]);

  const onAct = useCallback(
    async (itemId: string, action: ItemAction) => {
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
        // Refetch underneath the rows already on screen. The single-argument form is
        // deliberate: passing `undefined` as the second argument would blank the entry
        // first, dropping the teacher back to the skeleton for a whole round trip
        // after excusing one student.
        await mutate();
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not save', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [authFetch, mutate],
  );

  const onNudge = useCallback(
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

  const onReload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const tabProps: TabProps | null = useMemo(
    () => (data ? { data, busy, onAct, onNudge, onReload } : null),
    [data, busy, onAct, onNudge, onReload],
  );

  if (data === null || tabProps === null) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Skeleton variant="rounded" height={44} sx={{ borderRadius: 2, mb: 2, maxWidth: 260 }} />
        <Skeleton variant="rounded" height={90} sx={{ borderRadius: 3, mb: 2 }} />
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const needsRecap = data.classStats.filter(
    (c) => c.recap_state === 'recording_ready' || c.recap_state === 'draft',
  ).length;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 6 }}>
      <Typography
        variant="h5"
        component="h1"
        sx={{ fontWeight: 800, mb: 0.25, fontSize: { xs: '1.2rem', sm: '1.5rem' } }}
      >
        Catch-up
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Everyone who missed a class, why they missed it, and what they still have to do. Anyone who
        was away belongs here, not only students who joined late.
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
        <StatTile n={data.totals.unexplained} label="unexplained absences" tone="warn" />
        <StatTile n={data.totals.outstanding} label="classes outstanding" />
        <StatTile n={data.totals.clearedThisMonth} label="cleared this month" tone="good" />
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2, minHeight: 46 }}
      >
        <Tab value="students" label="Needs action" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46 }} />
        <Tab
          value="reasons"
          label={data.reasons.length > 0 ? `Reasons (${data.reasons.length})` : 'Reasons'}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46 }}
        />
        <Tab
          value="caught-up"
          label={data.completed.length > 0 ? `Caught up (${data.completed.length})` : 'Caught up'}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46 }}
        />
        <Tab
          value="classes"
          label={needsRecap > 0 ? `Classes and recaps (${needsRecap})` : 'Classes and recaps'}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 46 }}
        />
      </Tabs>

      {tab === 'students' && <NeedsActionTab {...tabProps} />}
      {tab === 'reasons' && <ReasonsTab {...tabProps} />}
      {tab === 'caught-up' && <CaughtUpTab {...tabProps} />}
      {tab === 'classes' && <ClassesRecapsTab {...tabProps} />}

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

/**
 * useSearchParams needs a Suspense boundary or the whole route opts out of
 * static generation and the build warns.
 */
export default function TeacherCatchUpPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          <Skeleton variant="rounded" height={44} sx={{ borderRadius: 2, mb: 2, maxWidth: 260 }} />
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
        </Box>
      }
    >
      <TeacherCatchUpWorkspace />
    </Suspense>
  );
}
