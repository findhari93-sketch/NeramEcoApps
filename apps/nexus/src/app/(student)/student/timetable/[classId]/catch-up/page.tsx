'use client';

/**
 * Catching up on a class you did not sit through.
 *
 * Steps in order, because doing them out of order is not catching up. Which
 * steps you get depends on why you are here:
 *
 *   Missed a class you were enrolled for: say why, watch it, finish the work.
 *   The reason step comes first not to nag but because it is the only part the
 *   teacher cannot find out any other way.
 *
 *   Joined after the class was taught: there is no why, so that step is not
 *   shown. Instead there is a final check at the end, because for a newcomer
 *   the point is not attendance, it is whether they actually know the material
 *   the rest of the class already covered.
 *
 * That final check is NOT a numbered step. It used to be, and a student put it
 * plainly: every question in it comes from the recording, so a paper standing
 * beside the recording is a second chore rather than the end of the class. It is
 * rendered inside the Class Recap step, under the player. A teacher-set class
 * test keeps its own step, because that one really is separate: the whole class
 * sat it.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RSVP_REASONS } from '@/lib/rsvp-reasons';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';
import { formatTime } from '@/components/timetable/date-utils';
import ClassCoverThumb from '@/components/timetable/ClassCoverThumb';
import ClassResourcesSection from '@/components/timetable/ClassResourcesSection';
import RecordingPlayerDialog from '@/components/timetable/RecordingPlayerDialog';
import RecapWatch from '@/components/class-recap/RecapWatch';
import FinalCheckPanel from '@/components/class-recap/FinalCheckPanel';
import { SECTION_LABEL_SX } from '@/components/timetable/timetable-theme';
import type { ClassImageRef } from '@/lib/class-cover';
import type { ClassResource } from '@/lib/class-resources';

interface CatchUpData {
  class: {
    id: string;
    title: string;
    description: string | null;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    recording_url: string | null;
    youtube_url: string | null;
    cover_image_id?: string | null;
    class_images?: ClassImageRef[] | null;
    /** Embedded by the catch-up route, so this screen costs no extra request. */
    class_resources?: ClassResource[] | null;
  };
  absence: { reason_code: string | null; reason_note: string | null; kind?: string } | null;
  assignments: Array<{ id: string; title: string; assignment_type: string; submitted: boolean }>;
  recap: { id: string; status: string } | null;
  /** Null until a teacher has built the class test for this class. */
  test: {
    placement_id: string;
    test_id: string;
    passing_pct: number;
    unlocked: boolean;
    passed: boolean;
    /** Which paper this is: the backlog's own, or one the teacher set for all. */
    source?: 'catchup' | 'class_test';
    /** False only for a teacher-set class test marked Optional. */
    required?: boolean;
    /** Where to open it. The two kinds have different players. */
    href?: string;
    /**
     * What the student has already done, all derived from the attempts. Before
     * these existed the screen could only say "not passed", so someone who had
     * sat the paper and missed the bar saw the exact screen they saw before
     * sitting it and concluded the app had lost their attempt.
     */
    attempts?: number;
    last_score_pct?: number | null;
    last_attempt_at?: string | null;
    best_score_pct?: number | null;
    question_count?: number | null;
    must_get_right?: number | null;
  } | null;
  steps: {
    reasonGiven: boolean;
    watched: boolean;
    workDone: boolean;
    testPassed: boolean;
    caughtUp: boolean;
  };
  /**
   * Whether the server will accept Mark caught up, decided by the same function
   * that will decide it on the way back in.
   *
   * The button used to derive this itself from the three step flags, which is
   * how a student came to face three green ticks and a refusal naming no cause:
   * the steps describe the checklist, and a checklist cannot show a gate that
   * has no step. Never reintroduce that derivation here.
   */
  canComplete: boolean;
  /** What to say under the button while it is disabled. Null when it is not. */
  blockedReason: string | null;
  /** False for someone who joined after the class ran: nothing to explain. */
  reasonRequired: boolean;
  /**
   * What they already told us about this class and where: before class (RSVP),
   * an away window, or on this screen. Null when nobody has said anything.
   */
  reason?: {
    code: string;
    note: string | null;
    source: 'before_class' | 'away' | 'after_class' | 'parent' | 'teacher';
    said: string;
  } | null;
  hasRecording: boolean;
  /**
   * The day this must be cleared by. Null until the student starts it: the
   * deadline is their own clock, not a date the timetable picked for them.
   */
  due_on: string | null;
  overdue: boolean;
  /** The clock is running on this class. */
  active: boolean;
  days_left: number | null;
  /** How long they get, so we can say so before they commit. */
  window_days: number;
  /** Another class in this classroom holds the clock. */
  active_elsewhere: {
    scheduled_class_id: string | null;
    title: string;
    days_left: number | null;
  } | null;
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function CatchUpPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();

  const [data, setData] = useState<CatchUpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The in-app recording, for a class whose guided recap is not ready yet. */
  const [playerOpen, setPlayerOpen] = useState(false);
  /** The guided recap is mounted inline once they have chosen to start. */
  const [watching, setWatching] = useState(false);
  /** Another class holds the clock, and we are asking before taking it. */
  const [switchAsk, setSwitchAsk] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/catch-up`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Could not load this catch-up.');
        return;
      }
      setData(body);
      setReasonCode(body.absence?.reason_code || '');
      setNote(body.absence?.reason_note || '');
    } catch {
      setError('Could not load this catch-up.');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/catch-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSnack({ msg: success, sev: 'success' });
        await load();
      } else {
        setSnack({ msg: body.error || 'Could not save', sev: 'error' });
      }
    } catch {
      setSnack({ msg: 'Could not save', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Ask for this class to be prepared, silently.
   *
   * Deliberately outside `act`: it must not set `busy`, must not raise a
   * snackbar and must not refetch, because none of that is the student's
   * business. They pressed Watch; the video is what should happen. The server
   * side is idempotent, so pressing Watch ten times queues once.
   */
  const queueRecap = async () => {
    try {
      const token = await getToken();
      await fetch(`/api/timetable/${classId}/catch-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'request_recap' }),
      });
    } catch {
      // Nothing to say. The nightly sweep finds this class on its own anyway.
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          {error || 'Nothing to catch up on here.'}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/student/timetable')}
          sx={{ mt: 2, textTransform: 'none', minHeight: 44 }}
        >
          Back to the timetable
        </Button>
      </Box>
    );
  }

  const { steps, assignments, recap, test } = data;
  const cls = data.class;
  // Someone who joined after this class ran. Nothing to explain, and a test to
  // pass at the end.
  const lateJoiner = !data.reasonRequired;
  // They already told us, before the class or by declaring time away. Asking
  // again was the single most repeated complaint about this screen, so the
  // step disappears and one line says their answer back instead.
  const toldUsEarlier =
    !!data.reason && (data.reason.source === 'before_class' || data.reason.source === 'away');
  const askReason = data.reasonRequired && !toldUsEarlier;
  const reasonLabel = (code: string | null | undefined, note: string | null | undefined) =>
    [RSVP_REASONS.find((r) => r.code === code)?.label, note?.trim()].filter(Boolean).join(', ') ||
    'Reason given';

  // Numbered in the order they are actually shown, so a newcomer never reads
  // "2. Watch the recording" as their first instruction.
  // A teacher-set class test is still its own numbered step: it is a paper the
  // whole class sat, genuinely separate from this student's catch-up. The
  // auto-generated final check is NOT, because every one of its questions comes
  // from the recording, so it belongs to the recap and is rendered inside it.
  const separateTestStep = !!test && test.source === 'class_test';

  const stepNo = (() => {
    let n = 0;
    return {
      reason: askReason ? ++n : 0,
      watch: ++n,
      work: ++n,
      test: separateTestStep ? ++n : 0,
    };
  })();

  /**
   * Watch. Either the guided recap, or the recording inside Nexus.
   *
   * There used to be a third possibility and it was the one students actually
   * met: with no recap, this button opened cls.youtube_url in a NEW TAB. That
   * took a student out of the app entirely, to a page with no checkpoints, no
   * quizzes, no watermark and no record that they had watched anything, which
   * is every protection this feature exists to provide, dropped in one click.
   *
   * Now a missing recap falls back to RecordingPlayerDialog, which streams the
   * same recording through Nexus with a per-viewer grant. It is ungated, so the
   * "I have watched it" declaration below still applies, but it never leaves the
   * boundary. Pressing it also queues the class for the recap sweep, so the next
   * person to open it gets the real thing.
   */
  const watch = () => {
    // Pressing Watch is unambiguously starting this class, so it takes the clock
    // if one is free. If another class already holds it, ask first: switching is
    // a decision, and the student keeps whatever time is left on the other one.
    if (!data.active && data.active_elsewhere) {
      setSwitchAsk(true);
      return;
    }
    if (recap) {
      setWatching(true);
      void startClock(false);
      return;
    }
    setPlayerOpen(true);
    void queueRecap();
  };

  /**
   * Take the clock for this class.
   *
   * The 409 is not a failure, it is the server saying another class holds it and
   * naming which. Every other error is swallowed: the student came here to
   * watch, and a clock that failed to move should not stop them.
   */
  const startClock = async (confirmSwitch: boolean) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/catch-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'start', confirm_switch: confirmSwitch }),
      });
      if (res.status === 409) {
        setSwitchAsk(true);
        return false;
      }
      if (res.ok) await load();
      return res.ok;
    } catch {
      return false;
    }
  };

  const stepBox = (
    n: number,
    done: boolean,
    title: string,
    children: React.ReactNode,
    locked = false,
  ) => (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 2,
        borderRadius: RADIUS.card,
        border: `1px solid ${done ? alpha(theme.palette.success.main, 0.4) : theme.palette.divider}`,
        bgcolor: done ? alpha(theme.palette.success.main, 0.04) : 'background.paper',
        boxShadow: SHADOW.card,
        opacity: locked ? 0.55 : 1,
      }}
    >
      <Box sx={{ pt: 0.25, flexShrink: 0 }}>
        {done ? (
          <CheckCircleIcon sx={{ fontSize: 22, color: 'success.main' }} />
        ) : (
          <RadioButtonUncheckedIcon sx={{ fontSize: 22, color: 'text.disabled' }} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.75 }}>
          {n}. {title}
        </Typography>
        {children}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto', pb: 10 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/student/timetable')}
        sx={{ textTransform: 'none', minHeight: 44, ml: -1, mb: 1 }}
      >
        Back to the timetable
      </Button>

      <Typography
        sx={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'primary.main',
        }}
      >
        {lateJoiner
          ? `Catch up, this was taught on ${formatDay(cls.scheduled_date)}`
          : `Catch up, you missed this on ${formatDay(cls.scheduled_date)}`}
      </Typography>
      {/* The picture from the class, ahead of the work. Seeing what was actually
          drawn or shown is the fastest way to know what you missed. */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.75, mt: 0.5, mb: 2 }}>
        <ClassCoverThumb cls={cls} size="md" />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
            {cls.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatTime(cls.start_time)} to {formatTime(cls.end_time)}
          </Typography>
        </Box>
      </Box>

      {/* The clock, and what it actually means. Stated plainly rather than as a
          colour, because "overdue" without a consequence reads as a threat and
          there is no consequence here beyond your teacher seeing it.
          Nothing is shown until they have started: a class nobody has begun
          cannot be late, and telling them otherwise was the whole problem. */}
      {!data.steps.caughtUp &&
        (data.active && data.due_on ? (
          <Alert
            severity={data.overdue ? 'error' : 'info'}
            sx={{ mb: 2, borderRadius: RADIUS.control }}
          >
            {data.overdue ? (
              <>
                <strong>This one has run over.</strong> It was due on {formatDay(data.due_on)}.
                Finishing it puts you back on track, and your teacher stops seeing you on the chase
                list.
              </>
            ) : (
              <>
                You have <strong>{data.days_left === 1 ? '1 day' : `${data.days_left} days`}</strong>{' '}
                left on this one, until {formatDay(data.due_on)}.
              </>
            )}
          </Alert>
        ) : data.active_elsewhere ? (
          <Alert severity="info" sx={{ mb: 2, borderRadius: RADIUS.control }}>
            You are part way through <strong>{data.active_elsewhere.title}</strong>. You can start
            this one instead, and the other keeps the time it has left.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 2, borderRadius: RADIUS.control }}>
            Nothing is overdue here. Once you start, you get{' '}
            <strong>{data.window_days} days</strong> to finish it.
          </Alert>
        ))}

      {cls.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {cls.description}
        </Typography>
      )}

      {steps.caughtUp && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          You have caught up on this class. Nothing else to do.
        </Alert>
      )}

      {toldUsEarlier && data.reason && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {data.reason.said}: {reasonLabel(data.reason.code, data.reason.note)}. No need to tell us again.
        </Typography>
      )}

      <Stack spacing={1.25}>
        {/* Why. The only part the teacher cannot find out any other way, and
            only a question worth asking of someone who was actually enrolled
            and has not already told us. */}
        {askReason && stepBox(
          stepNo.reason,
          steps.reasonGiven,
          'Tell us why you missed it',
          steps.reasonGiven ? (
            <Typography variant="body2" color="text.secondary">
              {data.reason
                ? reasonLabel(data.reason.code, data.reason.note)
                : reasonLabel(data.absence?.reason_code, data.absence?.reason_note)}
            </Typography>
          ) : (
            <>
              <Stack spacing={0.75} sx={{ mb: 1.25 }}>
                {RSVP_REASONS.map((r) => {
                  const on = reasonCode === r.code;
                  return (
                    <Box
                      key={r.code}
                      component="button"
                      type="button"
                      onClick={() => setReasonCode(r.code)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: '100%',
                        minHeight: 48,
                        px: 1.5,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '0.875rem',
                        fontWeight: on ? 700 : 500,
                        appearance: 'none',
                        borderRadius: RADIUS.control,
                        border: `1px solid ${on ? theme.palette.primary.main : theme.palette.divider}`,
                        bgcolor: on ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                        color: on ? theme.palette.primary.dark : theme.palette.text.primary,
                      }}
                    >
                      {on ? (
                        <CheckCircleIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                      ) : (
                        <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                      )}
                      {r.label}
                    </Box>
                  );
                })}
              </Stack>
              {reasonCode === 'other' && (
                <TextField
                  fullWidth
                  size="small"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened?"
                  sx={{ mb: 1.25 }}
                />
              )}
              <Button
                variant="contained"
                disabled={busy || !reasonCode}
                onClick={() =>
                  act(
                    { action: 'give_reason', reason_code: reasonCode, reason_note: note },
                    'Thanks, your teacher can see that now.',
                  )
                }
                sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
              >
                Save reason
              </Button>
            </>
          ),
        )}

        {/* Watch.
            The guided recap plays HERE now, rather than on its own route. One
            class used to span three screens, and Back landed somewhere
            different depending on which step you were on. */}
        {stepBox(
          stepNo.watch,
          steps.watched,
          'Class Recap',
          !data.hasRecording ? (
            <Typography variant="body2" color="text.secondary">
              The recording is not up yet. Check back, or ask your teacher.
            </Typography>
          ) : recap ? (
            <Box sx={{ mt: 0.5 }}>
              {watching ? (
                <RecapWatch
                  recapId={recap.id}
                  onProgress={(p) => {
                    // Finishing the recap clears the watch gate and opens the
                    // final check, both decided server-side, so the page has to
                    // refetch rather than infer it here.
                    if (p.completed) void load();
                  }}
                />
              ) : (
                <Button
                  variant={steps.watched ? 'outlined' : 'contained'}
                  onClick={watch}
                  startIcon={<SmartDisplayOutlinedIcon />}
                  sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                >
                  {steps.watched ? 'Watch again' : 'Start the class recap'}
                </Button>
              )}

              {/* The end of the class, not a separate errand. Every question in
                  it comes from this recording, so it belongs under the player
                  rather than as its own numbered step further down the page. */}
              {test && test.source !== 'class_test' && (
                <FinalCheckPanel
                  test={{
                    passing_pct: test.passing_pct,
                    unlocked: test.unlocked,
                    passed: test.passed,
                    attempts: test.attempts ?? 0,
                    last_score_pct: test.last_score_pct ?? null,
                    last_attempt_at: test.last_attempt_at ?? null,
                    best_score_pct: test.best_score_pct ?? null,
                    question_count: test.question_count ?? null,
                    must_get_right: test.must_get_right ?? null,
                  }}
                  onStart={() => router.push(test.href || `/student/catch-up/${cls.id}/test`)}
                  onRewatch={() => setWatching(true)}
                />
              )}
            </Box>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant={steps.watched ? 'outlined' : 'contained'}
                onClick={watch}
                startIcon={<SmartDisplayOutlinedIcon />}
                sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
              >
                {steps.watched ? 'Watch again' : 'Watch now'}
              </Button>
              {/* Only offered when there is no guided recap. Where one exists,
                  finishing its checkpoints IS the proof, and the server refuses
                  a self-declaration alongside it. */}
              {!steps.watched && (
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => act({ action: 'mark_watched' }, 'Marked as watched.')}
                  sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                >
                  I have watched it
                </Button>
              )}
              {/* Said out loud, because a student who was promised checkpoints
                  and gets a plain video deserves to know why, and to know it is
                  temporary rather than the way this class works. */}
              <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mt: 0.5 }}>
                The guided version with checkpoints is still being prepared for this class. Watch
                the recording now and it will be here next time.
              </Typography>
            </Stack>
          ),
        )}

        {/* The teacher's extra help, right where someone stuck on the recording
            would look for it. Deliberately not a numbered step: it is offered,
            never owed, so it must not read as one more thing to finish. Renders
            nothing when the class has none. */}
        <ClassResourcesSection
          cls={data.class as any}
          getToken={getToken}
          editable={false}
          resources={data.class.class_resources || []}
          hideWhenEmpty
          header={
            <Typography sx={{ ...SECTION_LABEL_SX, mb: 1.25 }}>
              Reference material from your teacher
            </Typography>
          }
        />

        {/* The work. Locked until the recording is watched: doing the
              assignment without the class is not catching up. */}
        {stepBox(
          stepNo.work,
          steps.workDone,
          assignments.length === 0 ? 'Nothing was set in this class' : 'Finish the assignment',
          assignments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No assignment came out of this class.
            </Typography>
          ) : !steps.watched ? (
            <Typography variant="body2" color="text.secondary">
              Watch the recording first.
            </Typography>
          ) : (
            <Stack spacing={0.75}>
              {assignments.map((a) => (
                <Stack
                  key={a.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ flexWrap: 'wrap' }}
                >
                  {a.submitted ? (
                    <CheckCircleIcon sx={{ fontSize: 17, color: 'success.main' }} />
                  ) : (
                    <RadioButtonUncheckedIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
                  )}
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 120, fontWeight: 600 }}>
                    {a.title}
                  </Typography>
                  {!a.submitted && (
                    <Button
                      size="small"
                      variant="outlined"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                      onClick={() => router.push(`/student/assignments/${a.id}`)}
                      sx={{ textTransform: 'none', minHeight: 40 }}
                    >
                      Open
                    </Button>
                  )}
                </Stack>
              ))}
            </Stack>
          ),
          assignments.length > 0 && !steps.watched,
        )}

        {/* The class test. Two different papers can stand here.

            ONLY a teacher-set class test reaches here now. That paper was set
            for the whole class, so an absent student sits exactly what their
            classmates sat, through the ordinary take engine, with no unlock and
            no rewatch rule, and it earns its own numbered step. When the teacher
            marked it Optional it is offered here and blocks nothing.

            The auto-generated final check is rendered inside the Class Recap
            step instead. See FinalCheckPanel. */}
        {separateTestStep && test && stepBox(
          stepNo.test,
          test.passed,
          test.required === false
            ? `Class test (optional, ${test.passing_pct}% to pass)`
            : `Pass the class test (${test.passing_pct}% to clear)`,
          test.passed ? (
            <Typography variant="body2" color="text.secondary">
              Passed. This class is done.
            </Typography>
          ) : !test.unlocked ? (
            <Typography variant="body2" color="text.secondary">
              Finish the guided recap to unlock the test.
            </Typography>
          ) : (
            <Stack spacing={1} alignItems="flex-start">
              {test.required === false && (
                <Typography variant="body2" color="text.secondary">
                  Your teacher set this as optional, so it will not hold this class open.
                </Typography>
              )}
              <Button
                variant={test.required === false ? 'outlined' : 'contained'}
                onClick={() => router.push(test.href || `/student/catch-up/${cls.id}/test`)}
                sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
              >
                Take the class test
              </Button>
            </Stack>
          ),
          !test.unlocked && !test.passed,
        )}
      </Stack>

      {!steps.caughtUp && (
        <Box sx={{ mt: 2.5 }}>
          <Button
            fullWidth
            variant="contained"
            disabled={busy || !data.canComplete}
            onClick={() => act({ action: 'mark_caught_up' }, 'Marked as caught up.')}
            sx={{ textTransform: 'none', minHeight: 48, fontWeight: 700, borderRadius: RADIUS.control }}
          >
            Mark as caught up
          </Button>
          {/* The server's own words for what is missing, rather than "finish the
              steps above", which is no help at all when every step above is
              already ticked. */}
          {!data.canComplete && data.blockedReason && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}
            >
              {data.blockedReason}
            </Typography>
          )}
        </Box>
      )}

      {/* Streams through Nexus with a per-viewer grant rather than handing out a
          Microsoft URL. showFallbackLink stays off: the raw SharePoint link is
          the one that refuses students who were not on the meeting invite. */}
      <RecordingPlayerDialog
        open={playerOpen}
        onClose={() => setPlayerOpen(false)}
        classId={cls.id}
        title={cls.title}
        getToken={getToken}
      />

      {/* Switching is a decision, so it is asked rather than done quietly.
          The reassurance matters more than the warning: the other class keeps
          the days it has left, so this is a choice about order, not a penalty. */}
      <Dialog open={switchAsk} onClose={() => setSwitchAsk(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>Start this one instead?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You are part way through <strong>{data.active_elsewhere?.title}</strong>
            {typeof data.active_elsewhere?.days_left === 'number' && data.active_elsewhere.days_left >= 0
              ? `, with ${data.active_elsewhere.days_left === 1 ? '1 day' : `${data.active_elsewhere.days_left} days`} left`
              : ''}
            . Starting this class pauses that one, and it will still have the same time left when you
            go back to it.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setSwitchAsk(false)}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Keep going with that one
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              setSwitchAsk(false);
              const ok = await startClock(true);
              if (ok && recap) setWatching(true);
              else if (ok) setPlayerOpen(true);
            }}
            sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700 }}
          >
            Start this one
          </Button>
        </DialogActions>
      </Dialog>

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
