'use client';

/**
 * Every recent class, what it still owes, and the button that fixes it.
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
  Stack,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RADIUS } from '@/components/timetable/timetable-theme';
import ClassAttendancePanel from '@/components/timetable/attendance/ClassAttendancePanel';
import { SECTION_HEADING_SX, shortDate } from './shared';
import type { ClassStat, RecapState, TabProps } from './types';
import RecapReviewQueue from '@/components/class-recap/RecapReviewQueue';

type Filter = 'all' | 'blocking' | 'needs_recap' | 'not_caught_up';

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

/** Students who missed this class and have not finished catching up on it. */
function notCaughtUp(c: ClassStat): number {
  return Math.max(0, c.missed - c.caughtUp);
}

export default function ClassesRecapsTab({ data, onReload }: TabProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getTeacherToken } = useNexusAuthContext();
  // Below lg the drawer takes the whole screen: 380px of roster beside a class
  // list on a phone is neither.
  const fullWidthDrawer = useMediaQuery(theme.breakpoints.down('lg'));

  const [filter, setFilter] = useState<Filter>('all');
  const [busyClass, setBusyClass] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openClassId, setOpenClassId] = useState<string | null>(null);

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

  const blockingCount = useMemo(
    () => data.classStats.filter((c) => c.blocked > 0).length,
    [data.classStats],
  );
  const needsRecapCount = useMemo(
    () => data.classStats.filter((c) => c.recap_state === 'recording_ready' || c.recap_state === 'draft').length,
    [data.classStats],
  );

  const outstandingCount = useMemo(
    () => data.classStats.filter((c) => notCaughtUp(c) > 0).length,
    [data.classStats],
  );

  const rows = useMemo(() => {
    if (filter === 'blocking') return data.classStats.filter((c) => c.blocked > 0);
    if (filter === 'not_caught_up') return data.classStats.filter((c) => notCaughtUp(c) > 0);
    if (filter === 'needs_recap') {
      return data.classStats.filter(
        (c) => c.recap_state === 'recording_ready' || c.recap_state === 'draft',
      );
    }
    return data.classStats;
  }, [data.classStats, filter]);

  /**
   * Walking the schedule inside the drawer.
   *
   * Indexed against the FILTERED rows, not every class, so "next" follows the
   * list the teacher is actually reading. Stepping off the end of a filter into
   * a class that filter excluded would be a different screen from the one they
   * were moving through.
   */
  const openIndex = openClassId ? rows.findIndex((c) => c.id === openClassId) : -1;
  const openClass = openIndex >= 0 ? rows[openIndex] : null;

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
    if (!manualTitle.trim() || !manualUrl.trim() || !data.classroomId) return;
    setCreatingManual(true);
    setError(null);
    try {
      const body = await teacherFetch('/api/class-recaps', {
        method: 'POST',
        body: JSON.stringify({
          title: manualTitle.trim(),
          classroom_id: data.classroomId,
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
  }, [manualTitle, manualUrl, data.classroomId, teacherFetch, router]);

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Recaps that generated automatically but did not clear the quality
          checks, so students cannot open them yet. Sits above the class list
          because it is the only part of this screen with something owed: every
          row is a class somebody cannot catch up on until a teacher looks.
          Renders nothing when the queue is empty. */}
      <RecapReviewQueue compact />

      <Stack
        direction="row"
        spacing={0.75}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}
      >
        <Chip
          label={`All ${data.classStats.length}`}
          onClick={() => setFilter('all')}
          color={filter === 'all' ? 'primary' : 'default'}
          variant={filter === 'all' ? 'filled' : 'outlined'}
          sx={{ fontWeight: 700, height: 34 }}
        />
        {blockingCount > 0 && (
          <Chip
            label={`Blocking students ${blockingCount}`}
            onClick={() => setFilter(filter === 'blocking' ? 'all' : 'blocking')}
            color={filter === 'blocking' ? 'error' : 'default'}
            variant={filter === 'blocking' ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, height: 34 }}
          />
        )}
        {outstandingCount > 0 && (
          <Chip
            label={`Not caught up ${outstandingCount}`}
            onClick={() => setFilter(filter === 'not_caught_up' ? 'all' : 'not_caught_up')}
            color={filter === 'not_caught_up' ? 'warning' : 'default'}
            variant={filter === 'not_caught_up' ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, height: 34 }}
          />
        )}
        {needsRecapCount > 0 && (
          <Chip
            label={`Needs a recap ${needsRecapCount}`}
            onClick={() => setFilter(filter === 'needs_recap' ? 'all' : 'needs_recap')}
            color={filter === 'needs_recap' ? 'warning' : 'default'}
            variant={filter === 'needs_recap' ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, height: 34 }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {/* The backlog button. Everything it prepares would eventually be done
            by the nightly sweep; this is for the teacher who has students
            waiting today. */}
        <Button
          size="small"
          variant="contained"
          startIcon={<AutoAwesomeIcon />}
          onClick={prepareMissing}
          disabled={!!prep && !prep.finished}
          sx={{ minHeight: 40, textTransform: 'none', fontWeight: 700 }}
        >
          {prep && !prep.finished ? 'Preparing...' : 'Prepare missing classes'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setManualOpen(true)}
          disabled={!data.classroomId}
          sx={{ minHeight: 40, textTransform: 'none' }}
        >
          Recap from a link
        </Button>
      </Stack>

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

      {rows.length === 0 ? (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          Nothing outstanding. Every recent class has what a student needs to catch up on it.
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
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {shortDate(c.scheduled_date)}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                      {c.title || 'Class'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.present} present · {c.missed} missed · {c.caughtUp} caught up
                    </Typography>
                    {notCaughtUp(c) > 0 && (
                      <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 700 }}>
                        {notCaughtUp(c)} {notCaughtUp(c) === 1 ? 'student has' : 'students have'} not
                        caught up
                      </Typography>
                    )}
                  </Box>
                  <Stack spacing={0.75} alignItems="flex-end">
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
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1.25, flexWrap: 'wrap', gap: 1 }}
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
                        color: c.recap_state === 'no_recording' ? 'text.secondary' : 'error.main',
                        fontWeight: 700,
                      }}
                    >
                      {c.blocked === 1
                        ? '1 student is waiting on this'
                        : `${c.blocked} students are waiting on this`}
                    </Typography>
                  )}
                  <Box sx={{ flex: 1 }} />
                  {/* The route into the roster behind these numbers. A teacher
                      reading "9 missed" wants the nine names and a way to
                      message them, and until now that meant going back to the
                      timetable and finding the class again. */}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<GroupsOutlinedIcon />}
                    onClick={() => setOpenClassId(c.id)}
                    sx={{ minHeight: 40, textTransform: 'none' }}
                  >
                    {notCaughtUp(c) > 0 ? `Follow up ${notCaughtUp(c)}` : 'Attendance'}
                  </Button>
                  {c.recap_state === 'no_recording' ? (
                    <Typography variant="caption" color="text.disabled">
                      Nothing to watch yet
                    </Typography>
                  ) : (
                    <Button
                      size="small"
                      variant={c.recap_state === 'published' ? 'outlined' : 'contained'}
                      disabled={busyClass === c.id}
                      onClick={() => openRecap(c)}
                      sx={{ minHeight: 40, textTransform: 'none' }}
                    >
                      {c.recap_state === 'published'
                        ? 'Edit recap'
                        : c.recap_state === 'draft'
                          ? 'Continue draft'
                          : 'Create recap'}
                    </Button>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {data.noRecording.length > 0 && filter === 'all' && (
        <Box sx={{ mt: 3.5 }}>
          <Typography sx={SECTION_HEADING_SX}>Counts for nobody</Typography>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            {data.noRecording.length === 1
              ? '1 class has no recording at all, so it holds nobody back and counts against nobody.'
              : `${data.noRecording.length} classes have no recording at all, so they hold nobody back and count against nobody.`}{' '}
            Add a recording and every affected student gets the class back on their list on its own.
          </Alert>
        </Box>
      )}

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
        {openClass && data.classroomId && (
          <>
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
              classroomId={data.classroomId}
              teamsMeetingId={openClass.teams_meeting_id ?? null}
              getToken={getTeacherToken}
              onChanged={onReload}
              navLabel={`${openIndex + 1} of ${rows.length}`}
              onPrev={openIndex > 0 ? () => setOpenClassId(rows[openIndex - 1].id) : undefined}
              onNext={
                openIndex < rows.length - 1 ? () => setOpenClassId(rows[openIndex + 1].id) : undefined
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
