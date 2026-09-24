'use client';

/**
 * Catch-up: getting every student through every class they missed.
 *
 * Two views of one job (2026-10 redesign, replacing four tabs):
 *
 *   Students   who is behind and WHY. The stat cards are the filter (Stuck,
 *              Stopped, Not started, Over time, Work left, On track, Waiting on
 *              us, All clear), reasons are a second filter, and every row says
 *              in one sentence how the student is actually working. Tapping a
 *              row opens their sheet: each class, the reason they gave (wherever
 *              they gave it), and how far they got.
 *   Calendar   every class by date, coloured by how its catch-up stands. Tapping
 *              a class opens its attendance drawer. A list toggle remains.
 *
 * What went, and why:
 *   - Reasons tab: a flat feed, one card per student per class, that never
 *     showed what students said on the RSVP or an away window. Reasons now sit
 *     on each row and in each class, resolved from all three places.
 *   - Standing tab and the class-group "Congratulate in Teams" post: students
 *     are now congratulated automatically and individually as they clear each
 *     class (lib/catchup-congrats.ts). The All clear card keeps the wall and a
 *     personal note from the teacher, sent 1:1 by Neram Assistant.
 *
 * Old links keep working: ?tab=classes opens the calendar, ?tab=caught-up opens
 * All clear, and ?tab=students / ?tab=reasons open Students.
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
  useTheme,
} from '@neram/ui';
import FilterTiles from '@/components/assignments/FilterTiles';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useAuthSWR } from '@/lib/nexus-swr';
import { EMPTY_PAYLOAD, withPayloadDefaults, type CachedPayload } from '@/components/catchup/payload';
import StudentsView from '@/components/catchup/StudentsView';
import ClassesRecapsTab, { type ClassesDisplay } from '@/components/catchup/ClassesRecapsTab';
import CelebrateDialog, { type CelebrateOutcome } from '@/components/catchup/CelebrateDialog';
import type { ItemAction, Row, TabProps } from '@/components/catchup/types';
import { DIAGNOSIS_META, DIAGNOSIS_ORDER, type Diagnosis } from '@/lib/catchup-diagnosis';
import type { ReasonFilterKey } from '@/lib/absence-reason';
import { isMonthKey, type CalendarClass } from '@/lib/catchup-calendar';
import { getMonthGrid } from '@/components/timetable/date-utils';

type View = 'students' | 'calendar';

const REASON_KEYS: ReasonFilterKey[] = ['unwell', 'family', 'clash', 'other', 'none'];

function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Read the URL once, mapping the four-tab links that are already out there. */
function readInitial(sp: URLSearchParams) {
  const tab = sp.get('tab');
  const viewParam = sp.get('view');
  const view: View = viewParam === 'calendar' || tab === 'classes' ? 'calendar' : 'students';
  const d = sp.get('d');
  const diagnosis: Diagnosis | null =
    tab === 'caught-up' ? 'all_clear' : d && (DIAGNOSIS_ORDER as string[]).includes(d) ? (d as Diagnosis) : null;
  const r = sp.get('reason');
  const reason = r && (REASON_KEYS as string[]).includes(r) ? (r as ReasonFilterKey) : null;
  const m = sp.get('month');
  const month = isMonthKey(m) ? m : istToday().slice(0, 7);
  const display: ClassesDisplay = sp.get('display') === 'list' ? 'list' : 'calendar';
  return { view, diagnosis, reason, month, display, classId: sp.get('class'), from: sp.get('from') };
}

function TeacherCatchUpWorkspace() {
  const searchParams = useSearchParams();
  const { loading: authLoading, activeClassroom } = useNexusAuthContext();
  const authFetch = useAuthFetch();
  const teacherFetch = useAuthFetch({ teacher: true });
  const theme = useTheme();

  const initial = useMemo(() => readInitial(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [view, setView] = useState<View>(initial.view);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(initial.diagnosis);
  const [reason, setReason] = useState<ReasonFilterKey | null>(initial.reason);
  const [month, setMonth] = useState(initial.month);
  const [display, setDisplay] = useState<ClassesDisplay>(initial.display);
  const [openClassId, setOpenClassId] = useState<string | null>(initial.classId);
  const cameFromTimetable = initial.from === 'timetable';

  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error'; undoMark?: string[] } | null>(null);
  const [noting, setNoting] = useState<Row[] | null>(null);
  const [noteOutcome, setNoteOutcome] = useState<CelebrateOutcome | null>(null);

  // The URL follows the screen, through replaceState rather than router.replace:
  // a query change through the router fetches an RSC payload for a page that is
  // entirely client rendered, a round trip per tap that renders nothing new.
  useEffect(() => {
    const p = new URLSearchParams();
    if (view === 'calendar') {
      p.set('view', 'calendar');
      p.set('month', month);
      if (display === 'list') p.set('display', 'list');
      if (openClassId) p.set('class', openClassId);
      if (openClassId && cameFromTimetable) p.set('from', 'timetable');
    } else {
      if (diagnosis) p.set('d', diagnosis);
      if (reason) p.set('reason', reason);
    }
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `/teacher/catch-up?${qs}` : '/teacher/catch-up');
  }, [view, diagnosis, reason, month, display, openClassId, cameFromTimetable]);

  // ── The overview (Students view, and the stat cards) ─────────────────────
  const key = authLoading
    ? null
    : `/api/catchup/overview${activeClassroom?.id ? `?classroomId=${activeClassroom.id}` : ''}`;
  const { data: fetched, error, mutate } = useAuthSWR<CachedPayload>(key);
  const data = useMemo(() => withPayloadDefaults(fetched) ?? (error ? EMPTY_PAYLOAD : null), [fetched, error]);

  const classroomId = activeClassroom?.id ?? data?.classroomId ?? null;

  // ── The month (Calendar view). Not fetched until the view is opened. ─────
  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const g = getMonthGrid(new Date(y, m - 1, 1));
    return { from: g.start, to: g.end };
  }, [month]);
  const calendarKey =
    !authLoading && view === 'calendar' && classroomId
      ? `/api/catchup/calendar?classroomId=${classroomId}&from=${range.from}&to=${range.to}`
      : null;
  const {
    data: calendar,
    error: calendarError,
    mutate: mutateCalendar,
  } = useAuthSWR<{ classes: CalendarClass[]; today: string }>(calendarKey);

  useEffect(() => {
    const e = error || calendarError;
    if (e) setSnack({ msg: e.message || 'Failed to load', sev: 'error' });
  }, [error, calendarError]);

  const reloadAll = useCallback(async () => {
    await Promise.all([mutate(), calendarKey ? mutateCalendar() : Promise.resolve()]);
  }, [mutate, mutateCalendar, calendarKey]);

  const onAct = useCallback(
    async (itemId: string, action: ItemAction) => {
      setBusy(itemId);
      try {
        await authFetch(`/api/catchup/items/${itemId}`, { method: 'POST', body: JSON.stringify({ action }) });
        setSnack({
          msg:
            action === 'excuse'
              ? 'Excused. It has left their list and their count.'
              : action === 'restore'
                ? 'Back on their list.'
                : 'Quiz reset. They can sit it again without rewatching.',
          sev: 'success',
        });
        await reloadAll();
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Could not save', sev: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [authFetch, reloadAll],
  );

  const onNudge = useCallback(
    async (studentId: string, journeyId: string | null) => {
      setBusy(studentId);
      try {
        await teacherFetch('/api/catchup/nudge', {
          method: 'POST',
          body: JSON.stringify({ studentIds: [studentId], journeyIds: journeyId ? [journeyId] : [] }),
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

  const onNudgeMany = useCallback(
    async (studentIds: string[], journeyIds: string[]) => {
      setBusy('bulk');
      try {
        await teacherFetch('/api/catchup/nudge', { method: 'POST', body: JSON.stringify({ studentIds, journeyIds }) });
        setSnack({
          msg: studentIds.length === 1 ? 'Nudge sent.' : `Nudge sent to ${studentIds.length} students.`,
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

  const onNote = useCallback((students: Row[]) => {
    setNoteOutcome(null);
    setNoting(students);
  }, []);

  const onNoteSend = useCallback(
    async (message: string) => {
      if (!classroomId) {
        setNoteOutcome({ ok: false, error: 'Pick a classroom first.' });
        return;
      }
      setBusy('celebrate');
      try {
        const res = await teacherFetch('/api/catchup/celebrate', {
          method: 'POST',
          body: JSON.stringify({
            classroomId,
            mode: 'note',
            studentIds: (noting || []).map((s) => s.student.id),
            message,
          }),
        });
        setNoteOutcome({ ok: true, named: res?.named || [], recorded: res?.recorded });
        await mutate();
      } catch (err) {
        setNoteOutcome({ ok: false, error: err instanceof Error ? err.message : 'Could not send the note' });
      } finally {
        setBusy(null);
      }
    },
    [teacherFetch, classroomId, noting, mutate],
  );

  const onMarkCelebrated = useCallback(
    async (students: Row[]) => {
      if (!classroomId || students.length === 0) return;
      setBusy('celebrate');
      try {
        const res = await authFetch('/api/catchup/celebrate', {
          method: 'POST',
          body: JSON.stringify({ classroomId, mode: 'mark', studentIds: students.map((s) => s.student.id) }),
        });
        const count = (res?.named || []).length;
        setSnack({
          msg: count === 1 ? 'Marked 1 student as congratulated.' : `Marked ${count} students as congratulated.`,
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
        ? { data, busy, onAct, onNudge, onNudgeMany, onNote, onMarkCelebrated, onReload: () => void reloadAll() }
        : null,
    [data, busy, onAct, onNudge, onNudgeMany, onNote, onMarkCelebrated, reloadAll],
  );

  // The header and the view tabs never wait for data: the Calendar has its own
  // fetch, and a teacher on a slow connection can switch to it immediately.
  const tally = data?.totals.byDiagnosis;
  const tileColor = (d: Diagnosis): string | undefined => {
    const tone = DIAGNOSIS_META[d].tone;
    if (!tally?.[d]) return undefined;
    if (tone === 'error') return theme.palette.error.main;
    if (tone === 'warning') return theme.palette.warning.dark;
    if (tone === 'success') return theme.palette.success.dark;
    if (tone === 'info') return theme.palette.info.dark;
    return undefined;
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 6 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800, mb: 0.25, fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
        Catch-up
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, display: { xs: 'none', sm: 'block' } }}>
        Every student through every class they missed. See who is stuck and why, and find any class by date.
      </Typography>

      <Tabs
        value={view}
        onChange={(_e, v) => setView(v)}
        variant="fullWidth"
        aria-label="Catch-up views"
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
          mb: 2,
          maxWidth: { sm: 360 },
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 48 },
        }}
      >
        <Tab value="students" label="Students" />
        <Tab value="calendar" label="Calendar" />
      </Tabs>

      {view === 'students' && (data === null || tabProps === null) ? (
        <>
          <Skeleton variant="rounded" height={130} sx={{ borderRadius: 3, mb: 2 }} />
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
        </>
      ) : view === 'students' && data && tabProps && tally ? (
        <>
          {/* The stat cards ARE the filter. Every number is a count of the rows
              beneath (totals.byDiagnosis is a tally of students), so a card and
              the list it opens cannot disagree. Four across on a phone, eight
              from md up. */}
          <FilterTiles<Diagnosis | 'none'>
            ariaLabel="Filter students by why they are behind"
            value={diagnosis ?? 'none'}
            onChange={(v) => {
              if (v === 'none') return;
              setDiagnosis(diagnosis === v ? null : v);
            }}
            tiles={DIAGNOSIS_ORDER.map((d) => ({
              value: d,
              label: DIAGNOSIS_META[d].label,
              count: tally[d],
              color: tileColor(d),
              attention: (d === 'stuck' || d === 'stopped') && tally[d] > 0,
            }))}
            sx={{
              gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', md: 'repeat(8, minmax(0, 1fr))' },
              mb: 1,
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.5 }}>
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {data.totals.outstanding}
            </Box>{' '}
            classes owed by {data.totals.studentsCatchingUp} students ·{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'success.dark' }}>
              {data.totals.clearedThisMonth}
            </Box>{' '}
            cleared this month · {data.totals.unexplained} missed with no reason given
          </Typography>

          <StudentsView
            {...tabProps}
            diagnosis={diagnosis}
            onDiagnosis={setDiagnosis}
            reason={reason}
            onReason={setReason}
            celebrating={busy === 'celebrate'}
          />
        </>
      ) : (
        <ClassesRecapsTab
          classroomId={classroomId}
          classes={calendar?.classes ?? null}
          today={calendar?.today ?? istToday()}
          month={month}
          onMonth={setMonth}
          display={display}
          onDisplay={setDisplay}
          openClassId={openClassId}
          onOpenClass={setOpenClassId}
          onReload={() => void reloadAll()}
          backHref={cameFromTimetable ? '/teacher/timetable' : null}
        />
      )}

      <CelebrateDialog
        open={!!noting}
        names={(noting || []).map((s) => s.student.name || s.student.email || 'Student')}
        repeats={(noting || [])
          .filter((s) => s.celebration?.state === 'congratulated')
          .map((s) => ({ name: s.student.name || s.student.email || 'Student', lastAt: s.celebration!.lastAt }))}
        busy={busy === 'celebrate'}
        outcome={noteOutcome}
        onClose={() => {
          setNoting(null);
          setNoteOutcome(null);
        }}
        onSend={onNoteSend}
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={snack?.undoMark?.length ? 8000 : 4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
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

/** useSearchParams needs a Suspense boundary or the route opts out of static generation. */
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
