'use client';

/**
 * The Classes view of Catch-up: every class in a month, as a calendar or a list,
 * what it still owes, and the button that fixes it.
 *
 * 2026-10: month scoped and calendar first. This used to be one long list of
 * the 60 most recent classes, which over a year meant scrolling to find "the
 * class on 11 Sept". The data now comes from /api/catchup/calendar one month at
 * a time, the default is a month grid (CatchupCalendar), and the list remains
 * a toggle for anyone who prefers it. Tapping a class opens the same attendance
 * drawer either way, which is where "who missed it, why, and how far they got"
 * is answered. The Timetable deep-links here with ?class= to open that drawer.
 *
 * Original notes:
 *
 * This tab is a merge of three screens that were each telling a teacher half the
 * story:
 *   - the old Classes tab      how many people missed a class and cleared it
 *   - the old "Cannot be caught up" tab   which classes have no recording or no
 *                              published recap, and how many students that blocks
 *   - the whole /teacher/class-recaps page   the same classes again, with a
 *                              Create recap button and no idea who was waiting
 *
 * They are one question ("what do I owe my students, and what do I press"), so
 * they are now one row. The recap editor itself is untouched and still lives at
 * /teacher/class-recaps/[recapId].
 *
 * Classes with full attendance are listed too. A class nobody missed can still
 * owe a recap, and finding that out should not require a second screen.
 *
 * WHAT THIS SCREEN IS FOR, since it changed. It was a work list: a queue of
 * recaps to make and publish. It is a record now, because nothing here is made
 * by hand any more, and the two bands above the list say so in order: what
 * needs a person (normally nothing), then what the automation did. The list
 * underneath is the receipt, and the one action on a row opens the editor for
 * the evening a student says a question is wrong.
 *
 * Scheduled exams are not in it. They used to be: an exam is a timetable row,
 * the overview query filtered on date and publish_state alone, and three test
 * windows rendered here as classes owing a recap, each one reading "No
 * recording" above "4 students are waiting on this" with nothing anybody could
 * press. The filter is in api/catchup/overview; see lib/class-kind.ts.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import Link from 'next/link';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RADIUS } from '@/components/timetable/timetable-theme';
import ClassAttendancePanel from '@/components/timetable/attendance/ClassAttendancePanel';
import { SECTION_HEADING_SX, shortDate } from './shared';
import type { RecapState } from './types';
import RecapReviewQueue from '@/components/class-recap/RecapReviewQueue';
import CatchupCalendar, { monthTitle } from './CatchupCalendar';
import type { CalendarClass } from '@/lib/catchup-calendar';

/** One class, as the calendar endpoint returns it. */
type ClassStat = CalendarClass;

export type ClassesDisplay = 'calendar' | 'list';

export interface ClassesViewProps {
  classroomId: string | null;
  /** The month's classes; null while loading. */
  classes: CalendarClass[] | null;
  today: string;
  month: string;
  onMonth: (next: string) => void;
  display: ClassesDisplay;
  onDisplay: (next: ClassesDisplay) => void;
  openClassId: string | null;
  onOpenClass: (id: string | null) => void;
  /** Reload after a change (the class drawer, a recap, not taught). */
  onReload: () => void;
  /** Set when the teacher came from the Timetable: the drawer offers the way back. */
  backHref?: string | null;
}

/**
 * `needs_recap` is gone.
 *
 * It selected classes whose recap was missing or still a draft, which was a
 * work list back when a recap was made by pressing a button. The sweep now runs
 * every fifteen minutes from 20:45 IST and publishes on its own, so that chip
 * had become a list of things that were already in hand, and offering it
 * invited a teacher to do work the machine was mid-way through.
 */
type Filter = 'all' | 'blocking' | 'not_caught_up';

const RECAP_LABEL: Record<RecapState, string> = {
  no_recording: 'No recording',
  recording_ready: 'Recap not made',
  draft: 'Draft recap',
  published: 'Recap published',
};

function recapTone(state: RecapState): 'error' | 'warning' | 'info' | 'success' {
  if (state === 'published') return 'success';
  if (state === 'draft') return 'info';
  if (state === 'recording_ready') return 'warning';
  return 'error';
}

/** Students who owe this class and have not finished catching up on it. */
function notCaughtUp(c: ClassStat): number {
  return c.outstanding;
}

export default function ClassesRecapsTab({
  classroomId,
  classes,
  today,
  month,
  onMonth,
  display,
  onDisplay,
  openClassId,
  onOpenClass,
  onReload,
  backHref,
}: ClassesViewProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getTeacherToken } = useNexusAuthContext();
  // Below lg the drawer takes the whole screen: 380px of roster beside a class
  // list on a phone is neither.
  const fullWidthDrawer = useMediaQuery(theme.breakpoints.down('lg'));

  const [filter, setFilter] = useState<Filter>('all');
  /**
   * How many rows the queue above found, reported up so the heading can be
   * honest about what is in it. Null until it has loaded, which is what keeps
   * the heading from flashing "0 things need you" on the way in.
   */
  const [needsYou, setNeedsYou] = useState<number | null>(null);
  const [busyClass, setBusyClass] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setOpenClassId = onOpenClass;
  const [moreEl, setMoreEl] = useState<HTMLElement | null>(null);

  /**
   * The row overflow, and what it can ask for.
   *
   * An overflow rather than a third button on the row: "Follow up 17" and
   * "Continue draft" already fill the width at 375px, and a session that was
   * not a class is rare enough that it should not cost the two common actions
   * their room.
   */
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; cls: ClassStat } | null>(null);
  const [confirmNotTaught, setConfirmNotTaught] = useState<ClassStat | null>(null);
  const [notTaughtBusy, setNotTaughtBusy] = useState(false);
  /**
   * The undo offer, which exists because the row LEAVES on success.
   *
   * Marking a session as not a class cancels it, and cancelled classes are
   * filtered out of this list upstream, so the card a teacher just acted on
   * disappears. Without an undo right here the only way back would be the
   * timetable, two screens away, on a class they can no longer see.
   */
  const [undoOffer, setUndoOffer] = useState<{ classId: string; count: number } | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [creatingManual, setCreatingManual] = useState(false);

  /**
   * The backfill run: where it is, and what it has done so far.
   *
   * Held here rather than in a dialog so it survives scrolling and stays visible
   * while it works. A run takes a minute per class, which is long enough that a
   * spinner with no words reads as a hang.
   */
  const [prep, setPrep] = useState<{
    total: number;
    done: number;
    current: string;
    published: number;
    held: number;
    failed: number;
    finished: boolean;
    stopped: string | null;
  } | null>(null);

  const teacherFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getTeacherToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Request failed');
      return payload;
    },
    [getTeacherToken],
  );

  // The list reads like the old tab: classes already taught, newest first.
  // Upcoming ones are only on the calendar, where the date explains them.
  const classStats = useMemo(
    () =>
      (classes || [])
        .filter((c) => c.health !== 'upcoming' && c.scheduled_date.slice(0, 7) === month)
        .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)),
    [classes, month],
  );
  const noRecording = useMemo(
    () => classStats.filter((c) => c.recap_state === 'no_recording' && c.outstanding > 0),
    [classStats],
  );

  const blockingCount = useMemo(
    () => classStats.filter((c) => c.blocked > 0).length,
    [classStats],
  );
  /** Classes a student can already open and work through. The normal case. */
  const liveCount = useMemo(
    () => classStats.filter((c) => c.recap_state === 'published').length,
    [classStats],
  );

  const outstandingCount = useMemo(
    () => classStats.filter((c) => notCaughtUp(c) > 0).length,
    [classStats],
  );

  const rows = useMemo(() => {
    if (filter === 'blocking') return classStats.filter((c) => c.blocked > 0);
    if (filter === 'not_caught_up') return classStats.filter((c) => notCaughtUp(c) > 0);
    return classStats;
  }, [classStats, filter]);

  /**
   * Walking the schedule inside the drawer.
   *
   * Indexed against the FILTERED rows, not every class, so "next" follows the
   * list the teacher is actually reading. Stepping off the end of a filter into
   * a class that filter excluded would be a different screen from the one they
   * were moving through.
   */
  // The calendar walks the month in date order; the list walks what it shows.
  const walk = useMemo(
    () => (display === 'calendar' ? [...classStats].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)) : rows),
    [display, classStats, rows],
  );
  const openIndex = openClassId ? walk.findIndex((c) => c.id === openClassId) : -1;
  // A deep link can name a class the current filter hides, or an upcoming one.
  const openClass =
    openIndex >= 0 ? walk[openIndex] : (classes || []).find((c) => c.id === openClassId) ?? null;

  /** Open the recap for a class, creating the draft first if there is not one. */
  const openRecap = useCallback(
    async (c: ClassStat) => {
      if (c.recap_id) {
        router.push(`/teacher/class-recaps/${c.recap_id}`);
        return;
      }
      setBusyClass(c.id);
      setError(null);
      try {
        const body = await teacherFetch('/api/class-recaps', {
          method: 'POST',
          body: JSON.stringify({ scheduled_class_id: c.id }),
        });
        if (body?.recap?.id) router.push(`/teacher/class-recaps/${body.recap.id}`);
        else onReload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create the recap');
      } finally {
        setBusyClass(null);
      }
    },
    [router, teacherFetch, onReload],
  );

  /**
   * "That was not a class."
   *
   * The 2026-09-18 session was the tutor opening the meeting to say the class
   * was postponed because of school exams. Six minutes of speech, nothing
   * taught, and seventeen students left owing a catch-up for it with nothing on
   * this card that could clear them: Continue draft would have written a recap
   * of an announcement, and Follow up 17 would have chased them over it.
   *
   * The attendance register is untouched by this, which is the point. Nineteen
   * people were in that room.
   */
  const markNotTaught = useCallback(
    async (c: ClassStat, undo: boolean) => {
      setNotTaughtBusy(true);
      setError(null);
      try {
        const body = await teacherFetch(`/api/timetable/${c.id}/not-taught`, {
          method: 'POST',
          body: JSON.stringify({ undo }),
        });
        setConfirmNotTaught(null);
        // Offered only one way. After an undo the class is back in the list and
        // the row itself is the confirmation, so a second offer to undo the
        // undo would just be a loop with no end.
        setUndoOffer(undo ? null : { classId: c.id, count: body?.excused ?? 0 });
        onReload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update this class');
      } finally {
        setNotTaughtBusy(false);
      }
    },
    [teacherFetch, onReload],
  );

  /**
   * Prepare every class that has a recording and a transcript but no usable
   * recap, one at a time.
   *
   * ONE REQUEST PER CLASS, deliberately. Preparing a class is several Gemini
   * calls of tens of seconds each, so a server-side loop over a backlog would
   * run past the Vercel function timeout and lose everything it had finished.
   * Walking the list from here also means the teacher can watch it work and the
   * run can stop cleanly the moment the shared key refuses, instead of spending
   * the rest of the backlog on a key that has already said no.
   */
  const prepareMissing = useCallback(async () => {
    setError(null);
    setPrep({
      total: 0, done: 0, current: '', published: 0, held: 0, failed: 0,
      finished: false, stopped: null,
    });
    try {
      const list = await teacherFetch('/api/class-recaps/autodraft');
      const candidates: Array<{ class_id: string; title: string | null }> = list.candidates || [];
      if (candidates.length === 0) {
        setPrep((p) => (p ? { ...p, finished: true } : p));
        return;
      }
      setPrep((p) => (p ? { ...p, total: candidates.length } : p));

      for (const [i, c] of candidates.entries()) {
        setPrep((p) => (p ? { ...p, done: i, current: c.title || 'Class' } : p));
        const out = await teacherFetch('/api/class-recaps/autodraft', {
          method: 'POST',
          body: JSON.stringify({ classId: c.class_id }),
        });

        if (out.reason === 'rate_limited') {
          setPrep((p) =>
            p
              ? {
                  ...p,
                  done: i,
                  finished: true,
                  stopped:
                    'The AI service is rate limited right now. What finished is saved. Try the rest in a few minutes.',
                }
              : p,
          );
          return;
        }

        setPrep((p) =>
          p
            ? {
                ...p,
                done: i + 1,
                published: p.published + (out.ok && out.published ? 1 : 0),
                held: p.held + (out.ok && out.held ? 1 : 0),
                failed: p.failed + (out.ok ? 0 : 1),
              }
            : p,
        );
      }

      setPrep((p) => (p ? { ...p, current: '', finished: true } : p));
      onReload();
    } catch (err) {
      setPrep(null);
      setError(err instanceof Error ? err.message : 'Could not prepare the missing classes');
    }
  }, [teacherFetch, onReload]);

  const createManual = useCallback(async () => {
    if (!manualTitle.trim() || !manualUrl.trim() || !classroomId) return;
    setCreatingManual(true);
    setError(null);
    try {
      const body = await teacherFetch('/api/class-recaps', {
        method: 'POST',
        body: JSON.stringify({
          title: manualTitle.trim(),
          classroom_id: classroomId,
          recording_url: manualUrl.trim(),
        }),
      });
      setManualOpen(false);
      setManualTitle('');
      setManualUrl('');
      if (body?.recap?.id) router.push(`/teacher/class-recaps/${body.recap.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the recap');
    } finally {
      setCreatingManual(false);
    }
  }, [manualTitle, manualUrl, classroomId, teacherFetch, router]);

  const viewSwitch = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <ToggleButtonGroup
        size="small"
        exclusive
        value={display}
        onChange={(_e, v) => v && onDisplay(v)}
        aria-label="Show classes as"
      >
        <ToggleButton value="calendar" aria-label="Calendar" sx={{ minWidth: 44, minHeight: 44 }}>
          <CalendarMonthOutlinedIcon fontSize="small" />
        </ToggleButton>
        <ToggleButton value="list" aria-label="List" sx={{ minWidth: 44, minHeight: 44 }}>
          <ViewListOutlinedIcon fontSize="small" />
        </ToggleButton>
      </ToggleButtonGroup>
      <IconButton
        aria-label="More recap actions"
        onClick={(e) => setMoreEl(e.currentTarget)}
        sx={{ width: 44, height: 44 }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
    </Stack>
  );

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* BAND 1: the only part of this screen that needs a person.
          Questions a student reported as wrong, then recaps the pipeline could
          not publish after retrying them across several nights. Renders nothing
          at all when both are empty, which is the normal state. */}
      {needsYou !== null && needsYou > 0 && (
        <Typography sx={{ ...SECTION_HEADING_SX, mb: 1 }}>
          {needsYou === 1 ? '1 thing needs you' : `${needsYou} things need you`}
        </Typography>
      )}
      <RecapReviewQueue compact onCount={setNeedsYou} />

      {/* BAND 2: what the automation has done, stated once and plainly.
          This screen used to open with a list of work. It opens with a fact
          now, because on a normal evening there is no work: the sweep has
          already published, and the row below is the receipt. */}
      {/* Only once the month has loaded: "0 of 0 classes ... everyone has
          caught up" on the way in is a claim about data we do not have yet. */}
      {classes !== null && (
      <Box
        sx={{
          px: 1.75,
          py: 1.25,
          mb: 2,
          borderRadius: RADIUS.card,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* Not gated on the queue above loading. These numbers came with the
            page and are already true; holding them behind a second request
            would put a skeleton over a fact we have. */}
        {classStats.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
            No classes taught in {monthTitle(month)} yet.
          </Typography>
        ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
          <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {liveCount} of {classStats.length} classes
          </Box>{' '}
          in {monthTitle(month)} are live for students, published automatically after each class ended.
          {outstandingCount > 0
            ? ` ${outstandingCount} still have someone working through them.`
            : ' Everyone who missed a class has caught up.'}
        </Typography>
        )}
      </Box>
      )}

      {/* Rarely needed escape hatches, so they live in a menu rather than
          above the calendar: the sweep publishes recaps on its own. */}
      <Menu
        anchorEl={moreEl}
        open={!!moreEl}
        onClose={() => setMoreEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          disabled={!!prep && !prep.finished}
          onClick={() => {
            setMoreEl(null);
            prepareMissing();
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <AutoAwesomeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Prepare missing classes" secondary="Build checkpoints for recorded classes" />
        </MenuItem>
        <MenuItem
          disabled={!classroomId}
          onClick={() => {
            setMoreEl(null);
            setManualOpen(true);
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Recap from a link" secondary="For a class not on the timetable" />
        </MenuItem>
      </Menu>

      {prep && (
        <Box
          sx={{
            p: 2,
            mb: 2,
            borderRadius: RADIUS.card,
            border: '1px solid',
            borderColor: prep.finished ? 'divider' : alpha(theme.palette.primary.main, 0.35),
            bgcolor: prep.finished ? 'background.paper' : alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
            {!prep.finished && <CircularProgress size={18} />}
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', flex: 1, minWidth: 0 }}>
              {prep.finished
                ? prep.total === 0
                  ? 'Nothing to prepare. Every recorded class already has its checkpoints.'
                  : 'Finished preparing.'
                : prep.total === 0
                  ? 'Looking for classes that need checkpoints...'
                  : `${prep.done + 1} of ${prep.total}: ${prep.current}`}
            </Typography>
            {prep.finished && (
              <IconButton
                size="small"
                aria-label="Dismiss"
                onClick={() => setPrep(null)}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          {prep.total > 0 && (
            <Box
              sx={{
                height: 8,
                borderRadius: 99,
                overflow: 'hidden',
                bgcolor: alpha(theme.palette.text.disabled, 0.12),
                mb: 1,
              }}
            >
              <Box
                sx={{
                  width: `${Math.round((prep.done / prep.total) * 100)}%`,
                  height: '100%',
                  bgcolor: 'primary.main',
                  transition: 'width 300ms ease',
                }}
              />
            </Box>
          )}

          {/* Held and failed are reported plainly rather than hidden behind a
              success count. A held recap is still a student who cannot catch
              up, and calling the run a success would bury that. */}
          {(prep.published > 0 || prep.held > 0 || prep.failed > 0) && (
            <Typography variant="caption" color="text.secondary">
              {prep.published} published
              {prep.held > 0 ? `, ${prep.held} need a look` : ''}
              {prep.failed > 0 ? `, ${prep.failed} could not be prepared` : ''}
            </Typography>
          )}

          {prep.stopped && (
            <Alert severity="warning" sx={{ mt: 1, borderRadius: 2 }}>
              {prep.stopped}
            </Alert>
          )}
        </Box>
      )}

      {display === 'calendar' ? (
        <CatchupCalendar
          month={month}
          classes={classes}
          today={today}
          onMonth={onMonth}
          onOpenClass={(id) => setOpenClassId(id)}
          trailing={viewSwitch}
        />
      ) : (
        <>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.125rem' }, flex: 1, minWidth: 0 }}>
              {monthTitle(month)}
            </Typography>
            {viewSwitch}
          </Stack>
          <Box role="group" aria-label="Filter classes" sx={{
              display: 'flex',
              gap: 1,
              mb: 2,
              flexWrap: 'wrap',
              '& .MuiChip-root': { height: 44, borderRadius: 22, px: 0.5, fontWeight: 700 },
            }}>
            <Chip
              label={`All ${classStats.length}`}
              onClick={() => setFilter('all')}
              color={filter === 'all' ? 'primary' : 'default'}
              variant={filter === 'all' ? 'filled' : 'outlined'}
            />
            {blockingCount > 0 && (
              <Chip
                label={`Blocked on us ${blockingCount}`}
                onClick={() => setFilter(filter === 'blocking' ? 'all' : 'blocking')}
                color={filter === 'blocking' ? 'error' : 'default'}
                variant={filter === 'blocking' ? 'filled' : 'outlined'}
              />
            )}
            {outstandingCount > 0 && (
              <Chip
                label={`Still catching up ${outstandingCount}`}
                onClick={() => setFilter(filter === 'not_caught_up' ? 'all' : 'not_caught_up')}
                color={filter === 'not_caught_up' ? 'warning' : 'default'}
                variant={filter === 'not_caught_up' ? 'filled' : 'outlined'}
              />
            )}
          </Box>
      {classes === null ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ height: 132, borderRadius: RADIUS.card, bgcolor: alpha(theme.palette.text.disabled, 0.08) }} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          {classStats.length === 0
            ? `No classes were taught in ${monthTitle(month)}.`
            : 'Nothing outstanding. Every class this month has what a student needs to catch up on it.'}
        </Alert>
      ) : (
        <Stack spacing={1}>
          {rows.map((c) => {
            const total = c.present + c.missed;
            const clearedPct = total > 0 ? ((c.present + c.caughtUp) / total) * 100 : 0;
            const outstandingPct = total > 0 ? (c.outstanding / total) * 100 : 0;
            const tone = recapTone(c.recap_state);
            return (
              <Box
                key={c.id}
                sx={{
                  p: 1.75,
                  borderRadius: RADIUS.card,
                  border: '1px solid',
                  borderColor:
                    c.blocked > 0 && c.recap_state !== 'no_recording'
                      ? alpha(theme.palette.error.main, 0.4)
                      : 'divider',
                  bgcolor:
                    c.blocked > 0 && c.recap_state !== 'no_recording'
                      ? alpha(theme.palette.error.main, 0.04)
                      : 'background.paper',
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 0.75, sm: 1 }}
                  alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {shortDate(c.scheduled_date)}
                    </Typography>
                    {/* Two lines before it clips: "E2E-CPv2 1783064..." told a
                        teacher nothing about which class this was. */}
                    <Typography
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {c.title || 'Class'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {c.present} present · {c.missed} missed · {c.caughtUp} caught up
                    </Typography>
                    {notCaughtUp(c) > 0 && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark', fontWeight: 700 }}>
                        {notCaughtUp(c)} {notCaughtUp(c) === 1 ? 'student has' : 'students have'} not
                        caught up
                      </Typography>
                    )}
                  </Box>
                  <Stack
                    direction={{ xs: 'row', sm: 'column' }}
                    spacing={0.75}
                    alignItems={{ xs: 'center', sm: 'flex-end' }}
                    sx={{ flexWrap: 'wrap', rowGap: 0.75 }}
                  >
                    <Chip
                      size="small"
                      color={tone}
                      label={RECAP_LABEL[c.recap_state]}
                      icon={
                        c.recap_state === 'no_recording' ? (
                          <VideocamOffOutlinedIcon sx={{ fontSize: 15 }} />
                        ) : undefined
                      }
                      sx={{ fontWeight: 700 }}
                    />
                    {c.outstanding > 0 && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={`${c.outstanding} outstanding`}
                        sx={{ fontWeight: 700 }}
                      />
                    )}
                  </Stack>
                </Stack>

                {total > 0 && (
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
                )}

                {/* The fact the old Class Recaps page could never show: this
                    missing recap is not admin, it is N people who cannot start. */}
                {/* On a phone the actions are one fixed row, Attendance and the
                    recap button sharing the width and the menu at the end. They
                    used to wrap, which stranded the menu on a line of its own. */}
                <Box
                  sx={{
                    mt: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: { xs: 'nowrap', sm: 'wrap' },
                    '& > .MuiButton-root': { flex: { xs: '1 1 0', sm: '0 0 auto' }, minWidth: 0, whiteSpace: 'nowrap' },
                  }}
                >
                  {/* Red only when we could fix it today. A class with no
                      recording at all is a content gap that counts against
                      nobody, and dressing it up as an urgent failure would put
                      an alarm next to the one thing on this screen a teacher
                      cannot act on. */}
                  {c.blocked > 0 && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: { xs: 'none', sm: 'block' },
                        color: c.recap_state === 'no_recording' ? 'text.secondary' : 'error.main',
                        fontWeight: 700,
                      }}
                    >
                      {c.blocked === 1
                        ? '1 student is waiting on this'
                        : `${c.blocked} students are waiting on this`}
                    </Typography>
                  )}
                  <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
                  {/* The route into the roster behind these numbers. A teacher
                      reading "9 missed" wants the nine names and a way to
                      message them, and until now that meant going back to the
                      timetable and finding the class again. */}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<GroupsOutlinedIcon />}
                    onClick={() => setOpenClassId(c.id)}
                    sx={{ minHeight: 44, textTransform: 'none' }}
                  >
                    {notCaughtUp(c) > 0 ? `Follow up ${notCaughtUp(c)}` : 'Attendance'}
                  </Button>
                  {c.recap_state === 'no_recording' ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ flex: { xs: '1 1 0', sm: '0 0 auto' }, textAlign: 'center', minWidth: 0 }}
                    >
                      Nothing to watch yet
                    </Typography>
                  ) : (
                    <Button
                      size="small"
                      variant={c.recap_state === 'published' ? 'outlined' : 'contained'}
                      disabled={busyClass === c.id}
                      onClick={() => openRecap(c)}
                      sx={{ minHeight: 44, textTransform: 'none' }}
                    >
                      {c.recap_state === 'published'
                        ? 'Edit recap'
                        : c.recap_state === 'draft'
                          ? 'Continue draft'
                          : 'Create recap'}
                    </Button>
                  )}
                  <IconButton
                    size="small"
                    aria-label={`More actions for ${c.title || 'this class'}`}
                    onClick={(e) => setMenuFor({ el: e.currentTarget, cls: c })}
                    sx={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
                {/* The waiting line, under the actions on a phone. */}
                {c.blocked > 0 && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: { xs: 'block', sm: 'none' },
                      mt: 0.75,
                      color: c.recap_state === 'no_recording' ? 'text.secondary' : 'error.main',
                      fontWeight: 700,
                    }}
                  >
                    {c.blocked === 1 ? '1 student is waiting on this' : `${c.blocked} students are waiting on this`}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
        </>
      )}

      {noRecording.length > 0 && (display === 'calendar' || filter === 'all') && (
        <Box sx={{ mt: 3.5 }}>
          <Typography sx={SECTION_HEADING_SX}>Counts for nobody</Typography>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            {noRecording.length === 1
              ? '1 class has no recording at all, so it holds nobody back and counts against nobody.'
              : `${noRecording.length} classes have no recording at all, so they hold nobody back and count against nobody.`}{' '}
            Add a recording and every affected student gets the class back on their list on its own.
          </Alert>
        </Box>
      )}

      {/* One item today, and still a menu. The row has room for two buttons at
          375px and this is the rarer of the three actions, so it gives its
          space to the two a teacher presses every week. */}
      <Menu
        anchorEl={menuFor?.el ?? null}
        open={!!menuFor}
        onClose={() => setMenuFor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            setConfirmNotTaught(menuFor?.cls ?? null);
            setMenuFor(null);
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <EventBusyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="No class was taught" />
        </MenuItem>
      </Menu>

      {/* Confirmed rather than done on the tap, because it moves every student
          on the class at once and the counts are the thing worth seeing first. */}
      <Dialog
        open={!!confirmNotTaught}
        onClose={() => (notTaughtBusy ? undefined : setConfirmNotTaught(null))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>No class was taught?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.25 }}>
            {`"${confirmNotTaught?.title || 'This class'}" on ${shortDate(confirmNotTaught?.scheduled_date || '')} will stop asking anyone to catch up.`}
          </Typography>
          {/* Attendance first. It is the thing a teacher is actually worried
              about losing, and the only other lever on a finished class
              (Delete Permanently) does destroy it. */}
          <Typography variant="body2" component="ul" sx={{ pl: 2.5, m: 0 }}>
            <li>The attendance register stays exactly as it is.</li>
            <li>
              {confirmNotTaught && notCaughtUp(confirmNotTaught) === 1
                ? '1 student stops owing a catch-up for this date.'
                : `${confirmNotTaught ? notCaughtUp(confirmNotTaught) : 0} students stop owing a catch-up for this date.`}
            </li>
            <li>The class shows as cancelled on the timetable.</li>
            <li>You can undo this.</li>
          </Typography>
          {!!confirmNotTaught?.caughtUp && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
              {confirmNotTaught.caughtUp === 1
                ? '1 student has already worked through this. Their completion is kept.'
                : `${confirmNotTaught.caughtUp} students have already worked through this. Their completion is kept.`}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmNotTaught(null)}
            disabled={notTaughtBusy}
            sx={{ minHeight: 44 }}
          >
            Go back
          </Button>
          {/* Not red. Every row it touches survives, and it reverses cleanly. */}
          <Button
            variant="contained"
            disabled={notTaughtBusy}
            startIcon={notTaughtBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={() => confirmNotTaught && markNotTaught(confirmNotTaught, false)}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Yes, it was not a class
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!undoOffer}
        autoHideDuration={12000}
        onClose={() => setUndoOffer(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setUndoOffer(null)}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={notTaughtBusy}
              onClick={() => {
                const target = classStats.find((c) => c.id === undoOffer?.classId);
                setUndoOffer(null);
                // The row has already gone from `classStats`, so rebuild the
                // little the undo needs rather than depending on finding it.
                markNotTaught(
                  target || ({ id: undoOffer?.classId || '' } as ClassStat),
                  true,
                );
              }}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
            >
              Undo
            </Button>
          }
          sx={{ width: '100%' }}
        >
          {undoOffer?.count === 1
            ? 'Marked as not a class. 1 student no longer owes a catch-up.'
            : `Marked as not a class. ${undoOffer?.count ?? 0} students no longer owe a catch-up.`}
        </Alert>
      </Snackbar>

      {/* The same panel the timetable opens in a dialog, in a drawer here, so a
          teacher reviewing the week meets one attendance surface rather than
          two that could drift. Prev and next walk the list behind it, which is
          the point: a class-by-class sweep without shutting anything. */}
      <Drawer
        anchor="right"
        open={!!openClass}
        onClose={() => setOpenClassId(null)}
        PaperProps={{
          sx: {
            width: fullWidthDrawer ? '100%' : 480,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {openClass && classroomId && (
          <>
            {backHref && (
              <Box sx={{ px: 1, pt: 1 }}>
                <Button
                  component={Link}
                  href={backHref}
                  startIcon={<ArrowBackIcon />}
                  sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700 }}
                >
                  Back to timetable
                </Button>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 2, pb: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {openClass.title || 'Class'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {shortDate(openClass.scheduled_date)}
                </Typography>
              </Box>
              <IconButton
                onClick={() => setOpenClassId(null)}
                aria-label="Close"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
            {/* Keyed on the class so stepping to the next one rebuilds the
                panel rather than leaving one class's ticks over another's
                roster. */}
            <ClassAttendancePanel
              key={openClass.id}
              classId={openClass.id}
              classTitle={openClass.title || 'Class'}
              classroomId={classroomId}
              teamsMeetingId={openClass.teams_meeting_id ?? null}
              getToken={getTeacherToken}
              onChanged={onReload}
              navLabel={openIndex >= 0 ? `${openIndex + 1} of ${walk.length}` : undefined}
              onPrev={openIndex > 0 ? () => setOpenClassId(walk[openIndex - 1].id) : undefined}
              onNext={
                openIndex >= 0 && openIndex < walk.length - 1 ? () => setOpenClassId(walk[openIndex + 1].id) : undefined
              }
            />
          </>
        )}
      </Drawer>

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Recap from a recording link</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            For a class that was scheduled straight in Teams and has no row in the timetable. Paste
            the recording link and we will build the recap around it.
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Class title"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              fullWidth
              autoFocus
              inputProps={{ style: { fontSize: 16 } }}
            />
            <TextField
              label="Recording link"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              fullWidth
              placeholder="https://..."
              inputProps={{ style: { fontSize: 16 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setManualOpen(false)} sx={{ minHeight: 44, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creatingManual || !manualTitle.trim() || !manualUrl.trim()}
            onClick={createManual}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {creatingManual ? 'Creating...' : 'Create recap'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
