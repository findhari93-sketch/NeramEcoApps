'use client';

/**
 * The catch-up workspace: one place for everything about a class a student did
 * not sit through.
 *
 * It answers four questions, in the order they get asked:
 *   Needs action        who do I call today
 *   Reasons             why did they miss it, in their own words
 *   Standing            who owes nothing at all, and what cleared lately
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
import {
  Alert,
  Box,
  Button,
  Skeleton,
  Snackbar,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import FilterTiles from '@/components/assignments/FilterTiles';
import type { CatchupBucket } from '@/lib/catchup-buckets';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useAuthSWR } from '@/lib/nexus-swr';
import {
  EMPTY_PAYLOAD,
  withPayloadDefaults,
  type CachedPayload,
} from '@/components/catchup/payload';
import NeedsActionTab from '@/components/catchup/NeedsActionTab';
import ReasonsTab from '@/components/catchup/ReasonsTab';
import StandingTab from '@/components/catchup/StandingTab';
import ClassesRecapsTab from '@/components/catchup/ClassesRecapsTab';
import CelebrateDialog, { type CelebrateOutcome } from '@/components/catchup/CelebrateDialog';
import type { ItemAction, Row, TabProps } from '@/components/catchup/types';

/**
 * The third key stays `caught-up` although the tab now reads "Standing".
 *
 * It is in the URL, so it is in bookmarks and in every notification deep link
 * already sent. Renaming the key to match the label would break those for a
 * cosmetic gain.
 */
type TabKey = 'students' | 'reasons' | 'caught-up' | 'classes';

const TAB_KEYS: TabKey[] = ['students', 'reasons', 'caught-up', 'classes'];

/** The header tiles: three buckets that open Needs action filtered, and all clear. */
type TileKey = 'run_over' | 'not_started' | 'waiting_on_us' | 'all_clear' | 'none';

/**
 * A tab label that fits a quarter of a phone.
 *
 * Four tabs with their long names ("Classes and recaps (2)") ran to about 490px,
 * so on a 375px phone the strip scrolled and cut two of them in half ("ction",
 * "Stan"). Below sm each tab takes an equal quarter with a short word over its
 * count; from sm up the full label comes back on one line.
 */
function TabLabel({ long, short, count }: { long: string; short: string; count?: number }) {
  return (
    <Box component="span" sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: { sm: 0.5 }, lineHeight: 1.2 }}>
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{long}</Box>
      <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{short}</Box>
      {count != null && count > 0 && (
        <Box component="span" sx={{ fontSize: { xs: '0.75rem', sm: 'inherit' }, fontWeight: { xs: 600, sm: 700 }, opacity: 0.85 }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>(</Box>
          {count}
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>)</Box>
        </Box>
      )}
    </Box>
  );
}

function TeacherCatchUpWorkspace() {
  const searchParams = useSearchParams();
  const { loading: authLoading, activeClassroom } = useNexusAuthContext();
  const authFetch = useAuthFetch();
  // Nudges go out as the teacher's own Teams chat, which needs the chat-capable token.
  const teacherFetch = useAuthFetch({ teacher: true });

  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{
    msg: string;
    sev: 'success' | 'error';
    /** Celebration ids a "Mark as congratulated" just wrote, for its Undo. */
    undoMark?: string[];
  } | null>(null);
  /** Non-null while the Teams preview is open. Holds the names it is showing. */
  const [celebrating, setCelebrating] = useState<Row[] | null>(null);
  const [celebrateOutcome, setCelebrateOutcome] = useState<CelebrateOutcome | null>(null);

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

  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));

  /**
   * The Needs action bucket filter, lifted here so the header tiles can set it.
   * They used to be read-only numbers above a row of filter chips carrying the
   * same numbers; on a phone the two together filled the first screen.
   */
  const [bucket, setBucket] = useState<CatchupBucket | null>(null);

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

  const { data: fetched, error, mutate } = useAuthSWR<CachedPayload>(key);

  // On a revisit `fetched` is already populated from the persisted cache, so the
  // skeleton below is never reached and the teacher lands on real rows.
  //
  // Which is also why it goes through withPayloadDefaults rather than straight into
  // the render. That first frame can be a payload the previous deploy wrote, and this
  // page reads `totals.byBucket.run_over` on it before any revalidation can land. It
  // did exactly that: an older `totals` had no `byBucket`, the tiles threw mid-render,
  // and a teacher got the crash screen instead of the app. See components/catchup/payload.ts.
  //
  // Falling back to the empty payload on an error keeps the previous behaviour: the page
  // shows its empty state next to the error snackbar, rather than a skeleton that never
  // resolves.
  //
  // Memoised because the merge builds a new object: unmemoised it would hand every tab a
  // fresh `data` identity on every render and re-render all of them for nothing.
  const data = useMemo(
    () => withPayloadDefaults(fetched) ?? (error ? EMPTY_PAYLOAD : null),
    [fetched, error],
  );

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
        await teacherFetch('/api/catchup/nudge', {
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
    [teacherFetch],
  );

  /**
   * The same endpoint, which has always accepted arrays. Kept separate from
   * `onNudge` because it reports differently: one student is "Nudge sent", a
   * selection has to say how many actually went out, since sendNudge drops any
   * id that resolves to a dormant student.
   */
  const onNudgeMany = useCallback(
    async (studentIds: string[], journeyIds: string[]) => {
      setBusy('bulk');
      try {
        await teacherFetch('/api/catchup/nudge', {
          method: 'POST',
          body: JSON.stringify({ studentIds, journeyIds }),
        });
        setSnack({
          msg:
            studentIds.length === 1
              ? 'Nudge sent.'
              : `Nudge sent to ${studentIds.length} students.`,
          sev: 'success',
        });
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not send', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch],
  );

  const onReload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  /**
   * Open the preview. Nothing is sent from here.
   *
   * The names are held in state only so the dialog can show them; the server
   * re-derives the list before posting and can only shorten it, so this is a
   * preview rather than the payload. See api/catchup/celebrate.
   */
  const onCelebrate = useCallback((students: Row[]) => {
    setCelebrateOutcome(null);
    setCelebrating(students);
  }, []);

  // The classroom the payload was built for, when the switcher has none. The
  // overview route falls back to the newest classroom, and a send that quietly
  // returned here left the teacher pressing a button that did nothing.
  const classroomId = activeClassroom?.id ?? data?.classroomId ?? null;

  const onCelebrateSend = useCallback(
    async (message: string, postToTeams: 'both' | 'channel') => {
      if (!classroomId) {
        setCelebrateOutcome({ ok: false, error: 'Pick a classroom first.' });
        return;
      }
      setBusy('celebrate');
      try {
        const res = await authFetch('/api/catchup/celebrate', {
          method: 'POST',
          body: JSON.stringify({
            classroomId,
            studentIds: (celebrating || []).map((s) => s.student.id),
            message,
            postToTeams,
          }),
        });
        setCelebrateOutcome({ ok: true, named: res?.named || [], recorded: res?.recorded });
        // Moves the students just named into "Already congratulated", so the
        // next press does not name them again.
        await mutate();
      } catch (err) {
        setCelebrateOutcome({
          ok: false,
          error: err instanceof Error ? err.message : 'Could not post to Teams',
        });
      } finally {
        setBusy(null);
      }
    },
    [authFetch, classroomId, celebrating, mutate],
  );

  /**
   * Record a congratulation that happened outside Nexus, without posting.
   * Offers Undo, because a mis-tap here hides a student from the next post.
   */
  const onMarkCelebrated = useCallback(
    async (students: Row[]) => {
      if (!classroomId || students.length === 0) return;
      setBusy('celebrate');
      try {
        const res = await authFetch('/api/catchup/celebrate', {
          method: 'POST',
          body: JSON.stringify({
            classroomId,
            mode: 'mark',
            studentIds: students.map((s) => s.student.id),
          }),
        });
        const count = (res?.named || []).length;
        setSnack({
          msg:
            count === 1
              ? 'Marked 1 student as congratulated.'
              : `Marked ${count} students as congratulated.`,
          sev: 'success',
          undoMark: res?.celebrationIds || [],
        });
        await mutate();
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not save', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [authFetch, classroomId, mutate],
  );

  const onUndoMark = useCallback(
    async (celebrationIds: string[]) => {
      setSnack(null);
      if (!classroomId || celebrationIds.length === 0) return;
      setBusy('celebrate');
      try {
        await authFetch('/api/catchup/celebrate', {
          method: 'POST',
          body: JSON.stringify({ classroomId, mode: 'unmark', celebrationIds }),
        });
        await mutate();
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not undo', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [authFetch, classroomId, mutate],
  );

  const tabProps: TabProps | null = useMemo(
    () =>
      data
        ? { data, busy, onAct, onNudge, onNudgeMany, onCelebrate, onMarkCelebrated, onReload, bucket, onBucket: setBucket }
        : null,
    [data, busy, onAct, onNudge, onNudgeMany, onCelebrate, onMarkCelebrated, onReload, bucket],
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
      {/* The explanation is for a first visit on a laptop. On a phone it was
          four lines standing between the teacher and the list. */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, display: { xs: 'none', sm: 'block' } }}>
        Everyone who missed a class, why they missed it, and what they still have to do. Anyone who
        was away belongs here, not only students who joined late.
      </Typography>

      {/*
        All four tiles count STUDENTS. They used to mix units: one counted people
        and three counted absence rows, so "8 need attention" sat beside "91
        unexplained" and read as though they were the same kind of thing. The
        row counts live in the line underneath.

        Every number here comes from totals.byBucket, which is a tally of the
        rows the tab renders. The tile and the group beneath it cannot disagree.

        2026-09-24: the tiles are now the way in, not a second copy of the
        filter chips. Run over, Not started and Waiting on us open Needs action
        on that group; All clear opens Standing. One row at every width, which
        on a phone replaced three rows of tiles (about 240px) with one of 60.
        "Classes cleared this month" was the fifth tile and is not a group of
        students, so it moved into the line below.
      */}
      <FilterTiles<TileKey>
        ariaLabel="Jump to a group of students"
        value={tab === 'students' && bucket ? (bucket as TileKey) : tab === 'caught-up' ? 'all_clear' : 'none'}
        onChange={(v) => {
          if (v === 'all_clear') {
            setBucket(null);
            setTab('caught-up');
          } else if (v !== 'none') {
            setBucket(tab === 'students' && bucket === v ? null : v);
            setTab('students');
          }
        }}
        tiles={[
          { value: 'run_over', label: 'Run over', count: data.totals.byBucket.run_over, color: data.totals.byBucket.run_over ? theme.palette.error.main : undefined, attention: data.totals.byBucket.run_over > 0 },
          { value: 'not_started', label: 'Not started', count: data.totals.byBucket.not_started, color: data.totals.byBucket.not_started ? theme.palette.warning.dark : undefined },
          { value: 'waiting_on_us', label: 'Waiting on us', count: data.totals.byBucket.waiting_on_us },
          { value: 'all_clear', label: 'All clear', count: data.totals.byBucket.all_clear, color: theme.palette.success.dark },
        ]}
        sx={{ mb: 1 }}
      />

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, lineHeight: 1.5 }}>
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{data.totals.outstanding}</Box> classes
        outstanding across {data.totals.studentsCatchingUp} students ·{' '}
        <Box component="span" sx={{ fontWeight: 700, color: 'success.dark' }}>{data.totals.clearedThisMonth}</Box> cleared
        this month · {data.totals.unexplained} absences with no reason
        {data.totals.hiddenDormant > 0 ? ` · ${data.totals.hiddenDormant} dormant hidden` : ''}
      </Typography>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        variant={phone ? 'fullWidth' : 'scrollable'}
        scrollButtons={phone ? false : 'auto'}
        aria-label="Catch-up views"
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
          mb: 2,
          minHeight: 48,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 700,
            minHeight: { xs: 56, sm: 48 },
            minWidth: 0,
            px: { xs: 0.5, sm: 2 },
            fontSize: { xs: '0.8125rem', sm: '0.875rem' },
          },
        }}
      >
        <Tab value="students" label={<TabLabel long="Needs action" short="Action" count={data.students.filter((s) => s.bucket !== 'all_clear').length} />} />
        <Tab value="reasons" label={<TabLabel long="Reasons" short="Reasons" count={data.reasons.length} />} />
        {/*
          The count is students who are completely clear, not finished items.
          It used to be `data.completed.length`, and "Caught up (7)" was read as
          seven finished students when it meant seven cleared classes in sixty
          days. Counting people under a heading about people is the fix.
        */}
        <Tab value="caught-up" label={<TabLabel long="Standing" short="Standing" count={data.totals.byBucket.all_clear} />} />
        <Tab value="classes" label={<TabLabel long="Classes and recaps" short="Recaps" count={needsRecap} />} />
      </Tabs>

      {tab === 'students' && <NeedsActionTab {...tabProps} />}
      {tab === 'reasons' && <ReasonsTab {...tabProps} />}
      {tab === 'caught-up' && <StandingTab {...tabProps} />}
      {tab === 'classes' && <ClassesRecapsTab {...tabProps} />}

      <CelebrateDialog
        open={!!celebrating}
        names={(celebrating || []).map((s) => s.student.name || s.student.email || 'Student')}
        repeats={(celebrating || [])
          .filter((s) => s.celebration?.state === 'congratulated')
          .map((s) => ({
            name: s.student.name || s.student.email || 'Student',
            lastAt: s.celebration!.lastAt,
          }))}
        busy={busy === 'celebrate'}
        outcome={celebrateOutcome}
        onClose={() => {
          setCelebrating(null);
          setCelebrateOutcome(null);
        }}
        onSend={onCelebrateSend}
      />

      <Snackbar
        open={!!snack}
        // Longer when there is an Undo, so there is time to reach it.
        autoHideDuration={snack?.undoMark?.length ? 8000 : 4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        // Clear of the bottom nav on a phone.
        sx={{ bottom: { xs: 80, md: 24 } }}
      >
        <Alert
          severity={snack?.sev}
          onClose={() => setSnack(null)}
          action={
            snack?.undoMark?.length ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => onUndoMark(snack.undoMark || [])}
                sx={{ fontWeight: 700, textTransform: 'none', minHeight: 44 }}
              >
                Undo
              </Button>
            ) : undefined
          }
        >
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
