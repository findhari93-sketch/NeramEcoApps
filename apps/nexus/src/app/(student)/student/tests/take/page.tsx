'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  LinearProgress,
  Chip,
  SwipeableDrawer,
  Snackbar,
  Alert,
  IconButton,
  Divider,
  TextField,
  alpha,
  useTheme,
  useMediaQuery,
  ImageViewerDialog,
} from '@neram/ui';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import NavigateBeforeOutlinedIcon from '@mui/icons-material/NavigateBeforeOutlined';
import NavigateNextOutlinedIcon from '@mui/icons-material/NavigateNextOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenOutlinedIcon from '@mui/icons-material/FullscreenOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useTestErrorReporter } from '@/hooks/useTestErrorReporter';
import { useTestProctoring, type ProctoringViolationKind } from '@/hooks/useTestProctoring';
import { useSearchParams, useRouter } from 'next/navigation';
import MathText from '@/components/common/MathText';
import DrawingPartsView from '@/components/question-bank/DrawingPartsView';
import type { QBDrawingParts } from '@neram/database';
import AnswerInput from '@/components/tests/AnswerInput';
import GradedReviewList, { type GradedReviewItem } from '@/components/tests/GradedReviewList';
import OptionBody, { type TestOption } from '@/components/tests/OptionBody';
import SectionStrip, { buildSectionRuns } from '@/components/tests/SectionStrip';
import { optionKeyAt } from '@/lib/option-keys';
import {
  DEFAULT_TEST_RETURN,
  DEFAULT_TEST_RETURN_LABEL,
  safeReturnLabel,
  safeReturnPath,
} from '@/lib/test-return';
import {
  failureCodeOf,
  isExpectedRefusal,
  nextAutoRetryDelay,
  submitFailureKind,
  type SubmitFailureKind,
} from '@/lib/test-error-classify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Option = TestOption;

interface Question {
  id: string;
  sort_order: number;
  marks: number;
  /** What a wrong answer costs. Zero on every test that does not penalise. */
  negative_marks?: number;
  /** Which part of the paper this question sits in, when the paper has sections. */
  section?: string | null;
  question: {
    id: string;
    question_text: string;
    question_image_url: string | null;
    question_type: string;
    options: Option[];
    /** A drawing split into parts, without solutions. */
    drawing_parts?: QBDrawingParts | null;
  };
}

interface TestInfo {
  id: string;
  title: string;
  test_type: string; // 'timed' | 'untimed' | 'per_question_timer'
  duration_minutes: number | null;
  per_question_seconds: number | null;
  total_marks: number;
}

interface AttemptInfo {
  id: string;
  answers: Record<string, string>;
  started_at: string;
}

// Side panel width
const SIDE_PANEL_W = 280;

const PROCTORING_VIOLATION_COPY: Record<ProctoringViolationKind, string> = {
  tab_switch: 'You switched away from the test tab.',
  window_blur: 'This window lost focus.',
  fullscreen_exit: 'You exited fullscreen.',
};

/** What POST /api/tests/attempt answered, as the submit flow needs it. */
type SaveOutcome =
  | { ok: true; payload: Record<string, any> }
  | {
      ok: false;
      /** null when no answer came back at all. */
      status: number | null;
      code: string | null;
      /** The server's own sentence, when it sent one. */
      error: string | null;
      /** On a closed attempt: what that attempt actually is. */
      attempt_status: string | null;
      /** Why no answer came back, for the report. */
      thrown: string | null;
    };

/**
 * A submit that did not go through, as the student sees it.
 *
 * Before this existed a failed submit showed nothing at all: the button stopped
 * spinning and the paper sat there. "When I click submit it is not getting
 * submitted. It just shows the same screen."
 */
interface SubmitProblem {
  kind: SubmitFailureKind;
  message: string;
  /** Seconds until the automatic retry, when one is scheduled. Static on purpose: see the alert. */
  retryInSeconds: number | null;
  /** Move focus to the alert's action. Only after the student's own press, never mid-paper. */
  focus: boolean;
}

const SUBMIT_FALLBACK = 'Your paper did not submit. Check your connection and try again.';
const ATTEMPT_CLOSED_COPY = 'This attempt was closed, so it could not be submitted.';


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** The graded result the submit response returns, review included. */
interface GradedResult {
  attempt_id: string;
  attempt_number: number;
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  passing_pct: number | null;
  review: GradedReviewItem[];
}

export default function TakeTestPage() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { getToken, activeClassroom } = useNexusAuthContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const testId = searchParams.get('test_id');
  const placementId = searchParams.get('placement_id');

  /**
   * Where "back" goes, and what the button is called.
   *
   * This page used to be reachable only from the tests list, so both were
   * hardcoded. A chapter test now opens here too, and dropping that student on
   * /student/tests afterwards strands them: the chapter they were reading is
   * two navigations away and nothing on screen says so.
   *
   * The path is sanitised because it arrives in a query string and is handed
   * to router.push. The label falls back whenever the path did, so a rejected
   * return can never leave a button reading "Back to the chapter" while
   * pointing at the tests list.
   */
  const returnTo = safeReturnPath(searchParams.get('return'));
  const returnLabel =
    returnTo === DEFAULT_TEST_RETURN
      ? DEFAULT_TEST_RETURN_LABEL
      : safeReturnLabel(searchParams.get('return_label'));

  const [loadError, setLoadError] = useState<string | null>(null);
  // A closed class test can be asked about, unlike an expired link.
  const [canRequestReopen, setCanRequestReopen] = useState(false);
  /** Set when the refusal was "finish catching up first", so the dead end gets an exit. */
  const [catchupBlocked, setCatchupBlocked] = useState(false);
  /**
   * Set when a practice door was refused because this paper is the student's
   * exam (or class test) right now. The refusal carries the way in.
   */
  const [liveRun, setLiveRun] = useState<{
    placement_id: string;
    test_id: string;
    kind: 'exam' | 'class_test';
    closes_at: string;
  } | null>(null);
  const [reopenNote, setReopenNote] = useState('');
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenAsked, setReopenAsked] = useState(false);

  /**
   * What broke while this student was sitting this paper.
   *
   * Never awaited and never allowed to throw: see useTestErrorReporter. The
   * whole point is that a teacher can open a test and see the failures that made
   * students walk away, which was previously unknowable, because a paper that
   * would not load never created an attempt row and so showed as "0 attempts".
   */
  const { report: reportTestError } = useTestErrorReporter({
    testId,
    classroomId: activeClassroom?.id ?? null,
    getToken,
  });

  // Core state
  const [test, setTest] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /** The graded result, including the per-question review with explanations. */
  const [result, setResult] = useState<GradedResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  /** Which go this is. Shown so an unlimited retake reads as progress. */
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);
  /**
   * How many more sittings this door allows once this one is submitted. null is
   * unlimited or unknown. 0 hides "Try again", which on a one-shot exam could
   * only ever be refused.
   */
  const [attemptsLeftAfterThis, setAttemptsLeftAfterThis] = useState<number | null>(null);
  /** The submit that did not go through, shown beside the submit action. */
  const [submitProblem, setSubmitProblem] = useState<SubmitProblem | null>(null);
  /** The attempt was closed under the student (or the exam shut). The paper is dead. */
  const [attemptClosed, setAttemptClosed] = useState(false);
  /** Submitted earlier (a double tap, the timer racing a press) and found to be in. */
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  /**
   * Refs, not state, for everything a timer or an event listener reads. The
   * timer's automatic submit and the proctoring limit both call handleSubmit from
   * a closure made renders ago, where `submitting` was still false. That stale
   * read is how a manual press and an automatic one both went out.
   */
  const submittingRef = useRef(false);
  const submittedRef = useRef(false);
  /** An automatic submit (timer or proctoring) is in play, so failures retry by themselves. */
  const autoSubmitRef = useRef(false);
  /** Automatic retries made so far in this run of failures. */
  const autoRetriesRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitActionRef = useRef<HTMLButtonElement | null>(null);
  /** The current render's handleSubmit, for callers holding an old closure. Assigned below. */
  const handleSubmitRef = useRef<(autoSubmit?: boolean) => Promise<void>>(async () => {});

  // UI state
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  const [snackSeverity, setSnackSeverity] = useState<'info' | 'warning'>('info');
  const [questionImageZoomed, setQuestionImageZoomed] = useState(false);

  /** null for every non-exam context -- see the GET route's own comment. */
  const [proctoringInfo, setProctoringInfo] = useState<{ enabled: boolean; violation_limit: number } | null>(
    null,
  );

  // Timers
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;

  /** The paper itself, for the unload handler, which cannot wait for a render. */
  const testRef = useRef(test);
  testRef.current = test;

  /**
   * The latest token, for the one request that cannot wait for getToken: the
   * final save as the page goes away. Refreshed on every save so a three-hour
   * exam does not leave with the token it opened with.
   */
  const tokenRef = useRef<string | null>(null);

  // Swipe tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  // The door is part of the key: "Take the exam" swaps placement_id on the same
  // paper, and the page has to load the exam rather than keep the refusal.
  useEffect(() => {
    if (!testId) return;
    fetchTestData();
  }, [testId, placementId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Forget the paper on screen. Called whenever a load fails, so the error screen
   * shows instead of whatever was loaded before: "Try again" on an exam result
   * was refused (attempts used up) and dropped the student back on their
   * finished paper with its answers blanked, because the old test and attempt
   * were still in state.
   */
  function clearPaper() {
    setTest(null);
    setAttempt(null);
    setQuestions([]);
  }

  async function fetchTestData() {
    setLoading(true);
    setLoadError(null);
    setLiveRun(null);
    try {
      const token = await getToken();
      if (!token) {
        clearPaper();
        return;
      }
      tokenRef.current = token;

      const res = await fetch(`/api/tests/attempt?test_id=${testId}${placementId ? `&placement_id=${placementId}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.error('Failed to load test:', res.status);
        clearPaper();
        const j = await res.json().catch(() => ({}));
        if (j?.error) setLoadError(j.error);
        // A closed class test is not a dead link: the student can ask their
        // teacher to reopen it, and the refusal carries whether that offer is
        // still available (they may have asked already).
        // Both closed doors, not just the class-test one. On production every
        // test a class sits together is an exam, so keying this on
        // CLASS_TEST_CLOSED alone meant no real student could ever reach the
        // ask. The route is the one that decides whether asking is possible;
        // this only reads its answer.
        setCanRequestReopen(
          (j?.code === 'CLASS_TEST_CLOSED' || j?.code === 'EXAM_CLOSED') && j?.can_request === true,
        );
        setCatchupBlocked(j?.code === 'CATCHUP_REQUIRED');
        setLiveRun(j?.code === 'LIVE_RUN' && j?.live_run ? j.live_run : null);
        // A paper that will not open never creates an attempt row, so this
        // failure was previously invisible to everyone: the student saw an
        // error, walked away, and the teacher's screen said "0 attempts".
        // The door refusing on purpose (attempts used up, sent to the live
        // exam, closed) is the door working, and reporting it is what put
        // "12 students failed to open the paper" on acf8084d.
        const loadMessage = j?.error || `Test failed to load (HTTP ${res.status})`;
        const loadCode = typeof j?.code === 'string' ? j.code : null;
        if (!isExpectedRefusal({ phase: 'load', code: loadCode, status: res.status, message: loadMessage })) {
          reportTestError({
            phase: 'load',
            message: loadMessage,
            detail: { status: res.status, code: loadCode, placement_id: placementId },
          });
        }
        return;
      }

      const data = await res.json();
      setTest(data.test);
      setAttemptNumber(data.attempt_number ?? null);
      setAttemptsLeftAfterThis(
        typeof data.attempts_left_after_this === 'number' ? data.attempts_left_after_this : null,
      );
      setQuestions((data.questions || []).filter((q: any) => q.question != null));
      setAttempt(data.attempt);
      setAnswers(data.attempt?.answers || {});
      setProctoringInfo(data.proctoring ?? null);

      if (data.test?.test_type === 'timed' && data.test?.duration_minutes && data.attempt?.started_at) {
        const startedAt = new Date(data.attempt.started_at).getTime();
        const durationMs = data.test.duration_minutes * 60 * 1000;
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, Math.floor((durationMs - elapsed) / 1000));
        setTimeLeftSeconds(remaining);
      }
    } catch (err) {
      console.error('Failed to load test:', err);
      clearPaper();
      reportTestError({
        phase: 'load',
        message: err instanceof Error ? err.message : 'Test failed to load',
        detail: { status: null, code: null },
      });
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Full-test timer countdown
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (timeLeftSeconds === null || timeLeftSeconds <= 0 || submitted || attemptClosed) return;

    timerRef.current = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Through the ref: this closure is from the render the clock started
          // in. If this submit fails it retries by itself (see handleSubmit).
          void handleSubmitRef.current(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeftSeconds !== null, submitted, attemptClosed]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Per-question timer countdown
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!test?.per_question_seconds || test.test_type !== 'per_question_timer' || submitted || attemptClosed) return;

    setQuestionTimeLeft(test.per_question_seconds);

    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
          setSnackSeverity('info');
          setSnackMessage("Time's up! Moving to next question...");
          if (currentIndex < questions.length - 1) {
            setCurrentIndex((i) => i + 1);
          } else {
            void handleSubmitRef.current(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [currentIndex, test?.per_question_seconds, test?.test_type, submitted, attemptClosed, questions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Auto-save every 30 seconds
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!attempt || submitted || attemptClosed) return;

    autoSaveRef.current = setInterval(() => {
      saveAnswers(answersRef.current, 'save');
    }, 30000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [attempt, submitted, attemptClosed]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Prevent back navigation, warn on leave, save on the way out
  // -------------------------------------------------------------------------

  const hasAttempt = Boolean(attempt);

  useEffect(() => {
    if (submitted || loading || attemptClosed || !hasAttempt) return;

    /**
     * Warn, and do nothing else.
     *
     * This used to abandon the attempt right here, before the student had chosen
     * Leave or Stay. So pressing Stay, refreshing, a pull-to-refresh or a
     * Microsoft sign-in redirect all closed the live attempt. Every submit after
     * that got a silent 409, and a reload handed the student a NEW EMPTY attempt
     * (with a different draw on a pool paper). Now a reload simply resumes:
     * startOrResumeAttempt returns the open attempt through the same door, with
     * whatever was saved.
     */
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    /**
     * One last save as the page goes, so a reload resumes with the answers the
     * student actually gave rather than the ones from up to 30 seconds ago.
     * keepalive lets it finish after the page is gone. pagehide fires whether or
     * not a beforeunload prompt was shown, and never while the student is still
     * choosing.
     */
    const handlePageHide = () => {
      if (submittedRef.current || submittingRef.current) return;
      const aid = attemptRef.current?.id;
      const tok = tokenRef.current;
      if (!aid || !tok) return;
      try {
        fetch('/api/tests/attempt', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ attempt_id: aid, answers: answersRef.current, action: 'save' }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // A body over the keepalive size limit throws synchronously. The last
        // autosave still stands.
      }

      /**
       * A one-question-at-a-time paper closes when the page does.
       *
       * Its clock is per question and lives only in this tab: on resume the
       * page starts at question 1 with a full timer, and "you cannot go back"
       * is enforced here rather than on the server. So resuming one of these
       * would hand out a fresh clock on every question and let earlier answers
       * be changed. Every other paper resumes, which is the point of not
       * abandoning on unload; this one shuts, exactly as it did before.
       */
      if (testRef.current?.test_type === 'per_question_timer') {
        try {
          fetch('/api/tests/attempt/abandon', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ attempt_id: aid }),
            keepalive: true,
          }).catch(() => {});
        } catch {
          // Same keepalive limit. The stale-attempt check still retires it.
        }
      }
    };

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [submitted, loading, attemptClosed, hasAttempt]);

  // -------------------------------------------------------------------------
  // Proctoring (only active when the GET response's proctoring.enabled is
  // true, i.e. only for a teacher-scheduled proctored test -- see this
  // route's own comment on why every other context leaves it null/false).
  // -------------------------------------------------------------------------

  const proctoring = useTestProctoring({
    attemptId: attempt?.id ?? null,
    enabled: Boolean(proctoringInfo?.enabled),
    getToken,
    active: !loading && !submitted && !attemptClosed,
    onViolation: (kind, count, limit) => {
      setSnackSeverity('warning');
      setSnackMessage(
        `${PROCTORING_VIOLATION_COPY[kind]} Warning ${count}${limit ? ` of ${limit}` : ''}. The test submits automatically if this continues.`,
      );
    },
    onThresholdReached: () => {
      setSnackSeverity('warning');
      setSnackMessage('Too many warnings. Submitting your test now.');
      // Through the ref, and guarded inside: if the student's own press is
      // already in flight this does not send a second one.
      void handleSubmitRef.current(true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  });

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Send the answers. Never throws; says exactly what came back.
   *
   * It reports nothing itself. Whether a failed submit is worth a teacher's
   * attention depends on what the attempt turns out to be (see handleSubmit), so
   * the decision is made there, once, with the shared classifier.
   */
  const saveAnswers = useCallback(
    async (currentAnswers: Record<string, string>, action: 'save' | 'submit'): Promise<SaveOutcome> => {
      const current = attemptRef.current;
      const noAnswer = (thrown: string): SaveOutcome => ({
        ok: false,
        status: null,
        code: null,
        error: null,
        attempt_status: null,
        thrown,
      });
      if (!current) return noAnswer('No attempt is open');
      try {
        const token = await getToken();
        if (!token) return noAnswer('Could not get a sign-in token');
        tokenRef.current = token;

        const res = await fetch('/api/tests/attempt', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            attempt_id: current.id,
            answers: currentAnswers,
            action,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, any>;
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            code: typeof json?.code === 'string' ? json.code : null,
            error: typeof json?.error === 'string' && json.error.trim() ? json.error : null,
            attempt_status: typeof json?.attempt_status === 'string' ? json.attempt_status : null,
            thrown: null,
          };
        }
        // The submit response carries the graded result and the per-question
        // review, which is what the result screen renders.
        return { ok: true, payload: json };
      } catch (err) {
        console.error('Failed to save answers:', err);
        return noAnswer(err instanceof Error ? err.message : 'Network request failed');
      }
    },
    [getToken],
  );

  /**
   * Is this closed attempt in fact submitted, and if so what did it score?
   *
   * The attempt route says which it is on the 409 itself. The student attempts
   * history supplies the result where one may be shown, and answers "was it
   * submitted" when the route could not. For an exam whose results are not
   * published it returns nothing, and the paper is shown as in without a score.
   */
  async function confirmClosedAttempt(
    statusFromServer: string | null,
  ): Promise<{ submitted: boolean; status: string | null; result: GradedResult | null }> {
    const current = attemptRef.current;
    if (!current || (statusFromServer && statusFromServer !== 'submitted')) {
      return { submitted: false, status: statusFromServer, result: null };
    }

    let result: GradedResult | null = null;
    try {
      const token = await getToken();
      if (token && testId) {
        const qs = placementId ? `?placement_id=${encodeURIComponent(placementId)}` : '';
        const res = await fetch(`/api/student/tests/${encodeURIComponent(testId)}/attempts${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = res.ok ? await res.json().catch(() => ({})) : {};
        const row = (json?.data?.attempts || []).find((a: any) => a?.attempt_id === current.id);
        if (row) {
          result = {
            attempt_id: row.attempt_id,
            attempt_number: Number(row.attempt_number) || 1,
            score: Number(row.score) || 0,
            total_marks: Number(row.total_marks) || 0,
            percentage: Number(row.percentage) || 0,
            passed: Boolean(row.passed),
            passing_pct: json?.data?.test?.passing_pct ?? null,
            review: Array.isArray(row.review) ? row.review : [],
          };
        }
      }
    } catch {
      // The history is a nicety here. The server's own answer still stands.
    }

    if (statusFromServer === 'submitted' || result) return { submitted: true, status: 'submitted', result };
    return { submitted: false, status: null, result: null };
  }

  function handleAnswer(questionId: string, value: string) {
    // Per-question timer: can't answer past questions
    if (isPerQuestion) {
      const qIdx = questions.findIndex((q) => q.question.id === questionId);
      if (qIdx < currentIndex) return;
    }
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  /**
   * Upload a photograph of a drawing.
   *
   * Reuses the EXISTING drawing upload route, which already verifies the token,
   * normalises image/jpg to image/jpeg for the Android cameras that send the
   * wrong MIME, and returns { url, path }. There was no reason for a second
   * upload endpoint, and a second one would have needed the same two fixes.
   */
  const uploadDrawing = useCallback(
    async (file: File): Promise<{ url: string; path?: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Sign in and try again.');

      const form = new FormData();
      form.append('file', file);
      form.append('bucket', 'drawing-uploads');

      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || 'That did not upload. Check your connection and try again.');
      }
      return { url: json.url, path: json.path };
    },
    [getToken],
  );

  function clearRetryTimer() {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function stopClocks() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
  }

  function finishSubmitted(graded: GradedResult | null, foundAlreadyIn: boolean) {
    submittedRef.current = true;
    autoSubmitRef.current = false;
    autoRetriesRef.current = 0;
    clearRetryTimer();
    stopClocks();
    setSubmitProblem(null);
    setAlreadySubmitted(foundAlreadyIn);
    setResult(graded);
    setSubmitted(true);
  }

  /** The attempt cannot take a submit any more. Stop everything that would try. */
  function closeSitting(problem: SubmitProblem) {
    autoSubmitRef.current = false;
    clearRetryTimer();
    stopClocks();
    setAttemptClosed(true);
    setSubmitProblem(problem);
  }

  /**
   * Submit the paper.
   *
   * THE GUARD IS THE REF AT THE TOP, not the button's disabled prop. The timer
   * and the proctoring limit call in from old closures, and a double tap lands
   * before React re-renders the button, so `disabled` alone let two submits out.
   * An automatic call that arrives while one is in flight is not dropped
   * entirely: it marks the run as automatic, so if the in-flight submit fails it
   * still retries by itself.
   */
  async function handleSubmit(autoSubmit = false) {
    if (autoSubmit) autoSubmitRef.current = true;
    if (submittingRef.current || submittedRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitSheetOpen(false);
    clearRetryTimer();
    // Pressed from the alert while a retry was counting down: stop promising one.
    setSubmitProblem((p) => (p ? { ...p, retryInSeconds: null, focus: false } : p));

    const answersNow = answersRef.current;
    try {
      const outcome = await saveAnswers(answersNow, 'submit');
      if (outcome.ok) {
        finishSubmitted((outcome.payload.result as GradedResult) || null, false);
        return;
      }
      await handleSubmitFailure(outcome, answersNow, autoSubmit);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  handleSubmitRef.current = handleSubmit;

  async function handleSubmitFailure(
    outcome: Extract<SaveOutcome, { ok: false }>,
    answersNow: Record<string, string>,
    /** This call came from the timer, the proctoring limit or a scheduled retry. */
    automaticCall: boolean,
  ) {
    const current = attemptRef.current;
    const kind = submitFailureKind({ code: outcome.code, status: outcome.status, message: outcome.error });
    const reportMessage =
      outcome.error || outcome.thrown || `Submit failed (HTTP ${outcome.status ?? 'no response'})`;
    const report = (attemptStatus: string | null) => {
      const facts = {
        phase: 'submit',
        code: outcome.code ?? failureCodeOf({ message: outcome.error }),
        status: outcome.status,
        message: reportMessage,
        attemptStatus,
      };
      // A failed submit is the worst failure in the product, so a real one is
      // always reported. A paper that turned out to be in already is not one.
      if (isExpectedRefusal(facts)) return;
      reportTestError({
        phase: 'submit',
        attempt_id: current?.id ?? null,
        message: reportMessage,
        detail: {
          status: outcome.status,
          code: facts.code,
          attempt_status: attemptStatus,
          answered: Object.keys(answersNow).length,
          automatic: autoSubmitRef.current,
        },
      });
    };
    // Focus moves to the alert's action only after the student's own press.
    const focus = !automaticCall;

    if (kind === 'attempt_closed') {
      const closed = await confirmClosedAttempt(outcome.attempt_status);
      report(closed.status);
      if (closed.submitted) {
        finishSubmitted(closed.result, true);
        return;
      }
      closeSitting({ kind, message: ATTEMPT_CLOSED_COPY, retryInSeconds: null, focus });
      return;
    }

    report(null);

    if (kind === 'exam_closed') {
      // The close sweep (api/cron/exam-close) submits an open exam paper with
      // whatever was last SAVED. Autosave runs every 30 seconds, so the answers
      // given since would be lost; a save is still accepted after the close.
      void saveAnswers(answersNow, 'save');
      closeSitting({
        kind,
        message: outcome.error || 'This exam has closed, so your paper could not be submitted.',
        retryInSeconds: null,
        focus,
      });
      return;
    }

    // Worth trying again. An automatic submit does so by itself, backing off,
    // because the student may not be looking: the clock ran out on them.
    let retryInSeconds: number | null = null;
    if (autoSubmitRef.current) {
      const delay = nextAutoRetryDelay(autoRetriesRef.current);
      if (delay === null) {
        // Used up. From here it is the student's Try again.
        autoSubmitRef.current = false;
        autoRetriesRef.current = 0;
      } else {
        autoRetriesRef.current += 1;
        retryInSeconds = Math.round(delay / 1000);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void handleSubmitRef.current(true);
        }, delay);
      }
    }

    // A 5xx or no response carries no sentence meant for a student (an unknown
    // server error is sent back raw), so those get the plain explanation.
    // 401 is excluded with the 5xx: the attempt route answers an expired sign-in
    // (and anything it did not expect) with the raw message, and "Invalid
    // Microsoft token: 401" is not a sentence to show a student mid-paper.
    const serverSentence =
      outcome.status !== null && outcome.status < 500 && outcome.status !== 401 ? outcome.error : null;
    setSubmitProblem({ kind, message: serverSentence || SUBMIT_FALLBACK, retryInSeconds, focus });
  }

  /** "Try again" on a result: a fresh sitting, or the refusal if there is none. */
  function startAnotherAttempt() {
    submittedRef.current = false;
    autoSubmitRef.current = false;
    autoRetriesRef.current = 0;
    clearRetryTimer();
    setSubmitProblem(null);
    setAttemptClosed(false);
    setAlreadySubmitted(false);
    setSubmitted(false);
    setResult(null);
    setReviewOpen(false);
    setAnswers({});
    setCurrentIndex(0);
    setTimeLeftSeconds(null);
    fetchTestData();
  }

  // Keyboard and screen reader users land on the way forward after their own
  // press fails. Never mid-paper for an automatic one: that would yank focus
  // away from the question they are reading.
  useEffect(() => {
    if (submitProblem?.focus) submitActionRef.current?.focus();
  }, [submitProblem]);

  // No retry may fire after the page is gone.
  useEffect(() => {
    const timers = retryTimerRef;
    return () => {
      if (timers.current) clearTimeout(timers.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Swipe navigation (mobile only)
  // -------------------------------------------------------------------------

  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > Math.abs(deltaX)) return;

    if (deltaX < 0 && currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (deltaX > 0 && currentIndex > 0 && !isPerQuestion) {
      setCurrentIndex((i) => i - 1);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function formatTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function timerColor(seconds: number, total: number): 'default' | 'warning' | 'error' {
    const ratio = seconds / total;
    if (ratio < 0.1) return 'error';
    if (ratio < 0.25) return 'warning';
    return 'default';
  }

  const isPerQuestion = test?.test_type === 'per_question_timer';
  const answeredCount = questions.filter((q) => answers[q.question.id]).length;
  const unansweredCount = questions.length - answeredCount;

  // Where the sections of this paper begin and end in the served order. Empty
  // for an ordinary single-section test, in which case the strip renders nothing.
  const sectionRuns = buildSectionRuns(
    questions.map((q) => ({ id: q.question.id, section: q.section })),
    answers,
    (q) => q.id,
  );

  /** Does any question on this paper carry a penalty? Drives the warning below. */
  const hasNegativeMarking = questions.some((q) => Number(q.negative_marks) > 0);
  const currentQuestion = questions[currentIndex];

  // =========================================================================
  // RENDER: Submitted success screen
  // =========================================================================

  if (submitted) {
    const score = result?.score ?? 0;
    const outOf = result?.total_marks ?? 0;
    const pct = result?.percentage ?? 0;
    const passed = result?.passed ?? null;
    const bar = result?.passing_pct ?? null;
    const review = result?.review || [];
    const correctCount = review.filter((r: GradedReviewItem) => r.is_correct).length;
    const gradableCount = review.filter((r: GradedReviewItem) => r.is_gradable).length;
    const timeSpent = (attempt as any)?.time_spent_seconds as number | undefined;
    const thisAttempt = attemptNumber ?? (attempt as any)?.attempt_number ?? 1;

    /**
     * "Try again" only where another sitting can actually start. On a one-shot
     * exam it could only be refused, and before the refusal cleared the screen
     * it put the student back on their finished paper with blank answers.
     */
    const canTryAgain = attemptsLeftAfterThis !== 0;
    const resultActions = (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {canTryAgain && (
          <Button
            variant="contained"
            fullWidth={false}
            sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
            // A fresh attempt, not a resumed one: the previous attempt is
            // submitted, so the engine simply issues the next number.
            onClick={startAnotherAttempt}
          >
            Try again
          </Button>
        )}
        <Button
          variant={canTryAgain ? 'outlined' : 'contained'}
          sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
          onClick={() => router.push(returnTo)}
        >
          {returnLabel}
        </Button>
      </Box>
    );

    // In, but with no score to show: found submitted after a refused second
    // submit on an exam whose results are not published yet.
    if (!result) {
      return (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: 3,
            bgcolor: 'background.default',
            overflowY: 'auto',
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 560, pb: 6, textAlign: 'center', pt: 2 }}>
            <CheckCircleOutlinedIcon sx={{ fontSize: 64, color: 'success.main', mb: 1 }} />
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
              Your paper is in
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {test?.title}
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              {alreadySubmitted
                ? 'It had already been submitted, so your answers are safe.'
                : 'Your answers were submitted.'}{' '}
              Your result shows in My Performance once it is ready.
            </Typography>
            {resultActions}
          </Box>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 3,
          bgcolor: 'background.default',
          overflowY: 'auto',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 560, pb: 6 }}>
          <Box sx={{ textAlign: 'center', pt: 2 }}>
            <CheckCircleOutlinedIcon
              sx={{ fontSize: 64, color: passed === false ? 'warning.main' : 'success.main', mb: 1 }}
            />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              {/* The headline states the outcome, not the mechanics. "Submitted"
                  tells a student nothing they did not already know. */}
              {passed === null ? 'All done' : passed ? 'Passed' : 'Not quite yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {test?.title} · Attempt {thisAttempt}
            </Typography>
          </Box>

          <Paper
            elevation={0}
            sx={{
              width: '100%',
              borderRadius: 3,
              border: `1px solid ${theme.palette.divider}`,
              overflow: 'hidden',
              mb: 2,
            }}
          >
            <Box
              sx={{
                bgcolor: alpha(
                  passed === false ? theme.palette.warning.main : theme.palette.success.main,
                  0.08,
                ),
                px: 2.5,
                py: 2.5,
                textAlign: 'center',
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="h3" sx={{ fontWeight: 800 }}>
                {Math.round(pct)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {score} of {outOf} marks
                {bar != null ? ` · pass mark ${bar}%` : ''}
              </Typography>
            </Box>

            <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Correct
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                  {correctCount} of {gradableCount}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Unanswered
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, color: unansweredCount > 0 ? 'warning.main' : 'text.secondary' }}
                >
                  {unansweredCount}
                </Typography>
              </Box>
              {timeSpent ? (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Time spent
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatTime(timeSpent)}
                    {gradableCount > 0 ? ` · ${formatTime(Math.round(timeSpent / gradableCount))} a question` : ''}
                  </Typography>
                </Box>
              ) : null}
            </Box>
          </Paper>

          {/* The review is the point of a practice test. Without it a student
              learns their score and nothing else. */}
          {review.length > 0 && (
            <>
              <Button
                fullWidth
                variant={reviewOpen ? 'text' : 'outlined'}
                onClick={() => setReviewOpen((o) => !o)}
                sx={{ textTransform: 'none', minHeight: 48, mb: 1.5 }}
              >
                {reviewOpen ? 'Hide the answers' : 'See what you got wrong'}
              </Button>

              {reviewOpen && (
                <GradedReviewList review={review} getToken={getToken} classroomId={activeClassroom?.id} />
              )}
            </>
          )}

          {resultActions}

          {/* Pressing Try again used to lose this review for good. It no longer
              does, but a student has no way to know that unless told. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            You can reopen these answers any time from My Performance.
          </Typography>
        </Box>
      </Box>
    );
  }

  // =========================================================================
  // RENDER: Loading
  // =========================================================================

  if (loading) {
    return (
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', bgcolor: 'background.default' }}>
        <Box sx={{ flex: 1, p: 2 }}>
          <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 1 }} />
          <Skeleton variant="rectangular" height={3} sx={{ mb: 2 }} />
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, mb: 2 }} />
          <Skeleton variant="rectangular" height={52} sx={{ borderRadius: 2, mb: 1 }} />
          <Skeleton variant="rectangular" height={52} sx={{ borderRadius: 2, mb: 1 }} />
          <Skeleton variant="rectangular" height={52} sx={{ borderRadius: 2, mb: 1 }} />
          <Skeleton variant="rectangular" height={52} sx={{ borderRadius: 2 }} />
        </Box>
        {isDesktop && (
          <Box sx={{ width: SIDE_PANEL_W, p: 2, borderLeft: `1px solid ${theme.palette.divider}` }}>
            <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2, mb: 2 }} />
            <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
          </Box>
        )}
      </Box>
    );
  }

  // =========================================================================
  // RENDER: Error
  // =========================================================================

  if (!test || !attempt || questions.length === 0) {
    return (
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 1200, p: 3, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <Box>
          <Typography variant="body1" color="text.secondary">
            {loadError || 'Unable to load test. Please go back and try again.'}
          </Typography>
          {/* This paper is their exam right now. The practice door says so and
              hands them the exam, instead of letting a practice run stand in
              for it the way it did on 18 Aug. */}
          {liveRun && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                It counts once, and it is open until{' '}
                {new Date(liveRun.closes_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: 'Asia/Kolkata',
                })}
                .
              </Typography>
              <Button
                variant="contained"
                onClick={() => {
                  const qs = new URLSearchParams(searchParams.toString());
                  qs.set('test_id', liveRun.test_id);
                  qs.set('placement_id', liveRun.placement_id);
                  router.replace(`/student/tests/take?${qs.toString()}`);
                }}
                sx={{ mt: 1.5, textTransform: 'none', minHeight: 48 }}
              >
                {liveRun.kind === 'exam' ? 'Take the exam' : 'Take the class test'}
              </Button>
            </Box>
          )}

          {/* Naming the classes is only half an answer. Sending them where the
              work actually is turns the refusal into a next step. */}
          {catchupBlocked && (
            <Button
              variant="contained"
              onClick={() => router.push('/student/catch-up')}
              sx={{ mt: 2, textTransform: 'none', minHeight: 48 }}
            >
              Go to my catch-up
            </Button>
          )}

          {/* A closed class test has a way back in, so the refusal offers it
              rather than leaving the student at a dead end. */}
          {canRequestReopen && placementId && (
            <Box sx={{ mt: 2, maxWidth: 420, mx: 'auto' }}>
              {reopenAsked ? (
                <Typography variant="body2" color="success.main">
                  Asked. Your teacher will see this on their class list.
                </Typography>
              ) : (
                <>
                  <TextField
                    fullWidth
                    size="small"
                    multiline
                    minRows={2}
                    placeholder="Tell your teacher why (optional)"
                    value={reopenNote}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReopenNote(e.target.value)}
                    sx={{ mb: 1 }}
                  />
                  <Button
                    variant="contained"
                    disabled={reopenBusy}
                    onClick={async () => {
                      setReopenBusy(true);
                      try {
                        const token = await getToken();
                        await fetch(`/api/tests/runs/${placementId}/access/request`, {
                          method: 'POST',
                          headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ note: reopenNote }),
                        });
                        setReopenAsked(true);
                      } finally {
                        setReopenBusy(false);
                      }
                    }}
                    sx={{ textTransform: 'none', minHeight: 48 }}
                  >
                    Ask my teacher to reopen it
                  </Button>
                </>
              )}
            </Box>
          )}
          <Button
            variant="outlined"
            onClick={() => router.push(returnTo)}
            sx={{ mt: 2, textTransform: 'none', minHeight: 48 }}
          >
            {returnLabel}
          </Button>
        </Box>
      </Box>
    );
  }

  // =========================================================================
  // RENDER: Fullscreen gate (proctored tests, where the browser supports it)
  //
  // Never blocks test start: on a browser without Fullscreen API support
  // (fullscreenSupported false, notably iOS Safari) this branch is simply
  // never reached, and the paper renders with tab-switch/blur detection alone.
  // =========================================================================

  if (proctoring.needsFullscreenGate) {
    const returning = proctoring.violationCount > 0;
    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          textAlign: 'center',
          bgcolor: 'background.default',
        }}
      >
        <FullscreenOutlinedIcon sx={{ fontSize: 56, color: returning ? 'warning.main' : 'primary.main', mb: 2 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {returning ? 'Return to fullscreen to continue' : 'This test is proctored'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 420 }}>
          {returning
            ? 'Leaving fullscreen has been logged as a warning. Enter fullscreen again to keep going.'
            : `Switching tabs or leaving fullscreen is tracked. The test submits automatically after ${proctoringInfo?.violation_limit ?? 3} warnings.`}
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={proctoring.enterFullscreen}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {returning ? 'Return to fullscreen' : 'Start in fullscreen'}
        </Button>
      </Box>
    );
  }

  // =========================================================================
  // RENDER: Test-taking UI
  // =========================================================================

  const questionId = currentQuestion?.question?.id;
  const selectedAnswer = questionId ? answers[questionId] : undefined;
  const isViewingPast = isPerQuestion && false; // future: allow read-only viewing of past Qs

  // ----- Shared: Question palette grid -----
  const questionGrid = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 1,
        justifyItems: 'center',
      }}
    >
      {questions.map((q, idx) => {
        const isAnswered = !!answers[q.question.id];
        const isCurrent = idx === currentIndex;
        const isPast = isPerQuestion && idx < currentIndex;
        const canJump = !isPerQuestion;
        return (
          <Box
            key={q.id}
            onClick={() => {
              if (!canJump) return;
              setCurrentIndex(idx);
              setPaletteOpen(false);
            }}
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: canJump ? 'pointer' : 'default',
              transition: 'all 120ms ease',
              border: 2,
              borderColor: isCurrent
                ? 'primary.main'
                : isAnswered
                  ? 'success.main'
                  : isPast
                    ? alpha(theme.palette.text.disabled, 0.3)
                    : 'divider',
              bgcolor: isAnswered
                ? alpha(theme.palette.success.main, 0.15)
                : isCurrent
                  ? alpha(theme.palette.primary.main, 0.1)
                  : isPast
                    ? alpha(theme.palette.action.disabledBackground, 0.3)
                    : 'transparent',
              color: isAnswered
                ? 'success.dark'
                : isCurrent
                  ? 'primary.main'
                  : isPast
                    ? 'text.disabled'
                    : 'text.secondary',
              opacity: isPast && !isAnswered ? 0.5 : 1,
              '&:hover': canJump ? { bgcolor: alpha(theme.palette.action.hover, 0.08) } : {},
            }}
          >
            {idx + 1}
          </Box>
        );
      })}
    </Box>
  );

  // ----- Shared: Stats summary -----
  const statsSummary = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main' }} />
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Answered</Typography>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>{answeredCount}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${theme.palette.divider}` }} />
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Unanswered</Typography>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>{unansweredCount}</Typography>
      </Box>
      {isPerQuestion && currentIndex > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: alpha(theme.palette.text.disabled, 0.3) }} />
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Skipped (timed out)</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {questions.slice(0, currentIndex).filter((q) => !answers[q.question.id]).length}
          </Typography>
        </Box>
      )}
    </Box>
  );

  // ----- Shared: the answer control -----
  //
  // A NUMERICAL question used to render its text and then nothing at all: this
  // block mapped over `options` unconditionally, and question_type was declared
  // on the interface and read nowhere. So the paper was unanswerable and the
  // student had no way to know why.
  const currentFormat = String(currentQuestion?.question.question_type || '').toUpperCase();
  const isNumerical = currentFormat === 'NUMERICAL';
  // A drawing question is answered with a photograph of the sheet.
  const isDrawing = currentFormat === 'DRAWING_PROMPT' || currentFormat === 'IMAGE_BASED';

  const numericInput = currentQuestion ? (
    <AnswerInput
      question={{
        question_id: currentQuestion.question.id,
        question_format: 'NUMERICAL',
      }}
      value={selectedAnswer ?? null}
      onChange={(v) => handleAnswer(currentQuestion.question.id, v)}
    />
  ) : null;

  const drawingInput = currentQuestion ? (
    <AnswerInput
      question={{
        question_id: currentQuestion.question.id,
        question_format: currentFormat,
      }}
      value={selectedAnswer ?? null}
      onChange={(v) => handleAnswer(currentQuestion.question.id, v)}
      uploadDrawing={uploadDrawing}
    />
  ) : null;

  const optionCards = currentQuestion ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.75, md: 1 } }}>
      {(currentQuestion.question.options || []).map((option, optIdx) => {
        const optionKey = optionKeyAt(option, optIdx);
        const displayLetter = option.label || String.fromCharCode(65 + optIdx);
        const isSelected = selectedAnswer === optionKey;
        // A figure needs the full width of a 375px screen, so the letter badge
        // moves above it instead of sitting beside it and stealing 40px.
        const isFigure = Boolean(option.image_url);
        return (
          <Paper
            key={optionKey}
            elevation={0}
            onClick={() => handleAnswer(currentQuestion.question.id, optionKey)}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAnswer(currentQuestion.question.id, optionKey);
              }
            }}
            sx={{
              cursor: 'pointer',
              transition: 'all 120ms ease',
              border: isSelected ? 2 : 1,
              borderColor: isSelected ? 'primary.main' : 'divider',
              bgcolor: isSelected
                ? alpha(theme.palette.primary.main, 0.06)
                : 'background.paper',
              borderRadius: 1.5,
              display: 'flex',
              flexDirection: isFigure ? 'column' : 'row',
              alignItems: isFigure ? 'stretch' : 'center',
              px: { xs: 1.5, md: 2 },
              py: { xs: 1, md: 1.25 },
              minHeight: { xs: 48, md: 52 },
              gap: 1.25,
              '&:hover': {
                borderColor: isSelected ? 'primary.main' : 'primary.light',
                bgcolor: isSelected
                  ? alpha(theme.palette.primary.main, 0.08)
                  : alpha(theme.palette.primary.main, 0.03),
              },
              '&:active': { transform: 'scale(0.995)' },
            }}
          >
            {/* Letter badge */}
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                alignSelf: isFigure ? 'flex-start' : 'auto',
                fontWeight: 700,
                fontSize: '0.8rem',
                transition: 'all 120ms ease',
                bgcolor: isSelected ? 'primary.main' : alpha(theme.palette.text.secondary, 0.08),
                color: isSelected ? 'primary.contrastText' : 'text.secondary',
              }}
            >
              {displayLetter}
            </Box>

            {/* Option text and figure */}
            <Box sx={{ flex: isFigure ? 'none' : 1, minWidth: 0 }}>
              <OptionBody option={option} letter={displayLetter} />
            </Box>
          </Paper>
        );
      })}
    </Box>
  ) : null;

  // ----- Shared: Prev/Next buttons -----
  const navButtons = (
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <Button
        variant="outlined"
        size="small"
        startIcon={<NavigateBeforeOutlinedIcon />}
        disabled={currentIndex === 0 || isPerQuestion}
        onClick={() => !isPerQuestion && setCurrentIndex((prev) => Math.max(0, prev - 1))}
        sx={{ textTransform: 'none', minHeight: 44, flex: 1 }}
      >
        Prev
      </Button>

      {currentIndex < questions.length - 1 ? (
        <Button
          variant="contained"
          size="small"
          endIcon={<NavigateNextOutlinedIcon />}
          onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
          sx={{ textTransform: 'none', minHeight: 44, flex: 1 }}
        >
          Next
        </Button>
      ) : (
        <Button
          variant="contained"
          color="success"
          size="small"
          endIcon={<SendOutlinedIcon />}
          onClick={() => setSubmitSheetOpen(true)}
          disabled={submitting}
          sx={{ textTransform: 'none', minHeight: 44, flex: 1 }}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
      )}
    </Box>
  );

  // ----- A submit that did not go through -----
  //
  // Sits directly above Prev/Submit, on every width, so it is beside the button
  // the student just pressed (or would press). role="alert" announces it. The
  // retry countdown is a static "in N seconds" rather than a ticking one on
  // purpose: a live region that changes every second is read out every second.
  const problemAction = submitProblem
    ? submitProblem.kind === 'retry'
      ? { label: submitting ? 'Submitting...' : 'Try again', onClick: () => void handleSubmit(false) }
      : submitProblem.kind === 'exam_closed'
        ? // The tests list is where "Ask my teacher" for another sitting lives.
          { label: DEFAULT_TEST_RETURN_LABEL, onClick: () => router.push(DEFAULT_TEST_RETURN) }
        : { label: returnLabel, onClick: () => router.push(returnTo) }
    : null;

  const submitProblemAlert =
    submitProblem && problemAction ? (
      <Alert
        severity="error"
        role="alert"
        sx={{
          mb: 1,
          alignItems: 'flex-start',
          '& .MuiAlert-message': { width: '100%', minWidth: 0 },
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
          {submitProblem.message}
        </Typography>
        {submitProblem.kind === 'retry' && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {submitting
              ? 'Sending your answers again now.'
              : submitProblem.retryInSeconds
                ? `Your answers are still here. Trying again by itself in ${submitProblem.retryInSeconds} seconds.`
                : 'Your answers are still here.'}
          </Typography>
        )}
        <Button
          ref={submitActionRef}
          variant="contained"
          // Primary, not the success green the Submit buttons use: white on the
          // Nexus success.main is about 3.3:1, under the 4.5:1 text needs.
          color="primary"
          onClick={problemAction.onClick}
          // Shown busy while the resend is in flight. handleSubmit's own guard
          // is what actually stops a second send.
          disabled={submitProblem.kind === 'retry' && submitting}
          aria-busy={submitProblem.kind === 'retry' && submitting}
          sx={{
            mt: 1,
            textTransform: 'none',
            minHeight: 48,
            minWidth: 140,
            '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'text.primary', outlineOffset: 2 },
          }}
        >
          {problemAction.label}
        </Button>
      </Alert>
    ) : null;

  // ----- Timer chip (shared) -----
  const timerChip = (() => {
    if (test.test_type === 'timed' && timeLeftSeconds !== null) {
      const clr = timerColor(timeLeftSeconds, (test.duration_minutes || 60) * 60);
      return (
        <Chip
          icon={<TimerOutlinedIcon />}
          label={formatTime(timeLeftSeconds)}
          size="small"
          color={clr}
          variant={clr === 'default' ? 'outlined' : 'filled'}
          sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
      );
    }
    if (test.test_type === 'per_question_timer' && questionTimeLeft !== null) {
      const clr = timerColor(questionTimeLeft, test.per_question_seconds || 60);
      return (
        <Chip
          icon={<TimerOutlinedIcon />}
          label={`${questionTimeLeft}s`}
          size="small"
          color={clr}
          variant={clr === 'default' ? 'outlined' : 'filled'}
          sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
      );
    }
    return null;
  })();

  // ----- Proctoring chip: violations logged so far this sitting -----
  const proctoringChip = proctoringInfo?.enabled ? (
    <Chip
      size="small"
      icon={<WarningAmberOutlinedIcon />}
      label={`${proctoring.violationCount}/${proctoringInfo.violation_limit}`}
      color={proctoring.violationCount > 0 ? 'warning' : 'default'}
      variant={proctoring.violationCount > 0 ? 'filled' : 'outlined'}
      sx={{ fontWeight: 600 }}
    />
  ) : null;

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* ================================================================= */}
      {/* TOP BAR                                                           */}
      {/* ================================================================= */}
      <Box
        sx={{
          px: 2,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'background.paper',
          borderBottom: `1px solid ${theme.palette.divider}`,
          flexShrink: 0,
          minHeight: 48,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
            {test.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            {answeredCount}/{questions.length} answered
          </Typography>
        </Box>

        {proctoringChip}
        {timerChip}

        {/* Mobile: palette trigger */}
        <Button
          variant="outlined"
          size="small"
          onClick={() => setPaletteOpen(true)}
          sx={{
            display: { xs: 'inline-flex', md: 'none' },
            minWidth: 44,
            minHeight: 36,
            px: 1,
            fontWeight: 700,
            fontSize: '0.8rem',
          }}
        >
          {currentIndex + 1}/{questions.length}
        </Button>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={(answeredCount / questions.length) * 100}
        sx={{ height: 3, flexShrink: 0 }}
      />

      {/* Which section you are in. Self-hiding on a single-section paper. */}
      <SectionStrip
        runs={sectionRuns}
        currentIndex={currentIndex}
        onJump={(index) => setCurrentIndex(index)}
      />

      {/* ================================================================= */}
      {/* MAIN CONTENT AREA                                                 */}
      {/* ================================================================= */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* -------------------------------------------------------------- */}
        {/* LEFT: Question content                                          */}
        {/* -------------------------------------------------------------- */}
        <Box
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            minWidth: 0,
          }}
        >
          {/* Scrollable question area */}
          <Box
            sx={{
              flex: 1,
              px: { xs: 2, sm: 3, md: 4 },
              py: { xs: 1.5, md: 2 },
              overflow: 'auto',
            }}
          >
            {currentQuestion && (
              <>
                {/* Question header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      px: 1.25,
                      py: 0.25,
                      borderRadius: 1,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      flexShrink: 0,
                    }}
                  >
                    Q{currentIndex + 1}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {currentQuestion.marks} {currentQuestion.marks === 1 ? 'mark' : 'marks'}
                  </Typography>
                  {/* Per-question timer inline (desktop only) */}
                  {isDesktop && test.test_type === 'per_question_timer' && questionTimeLeft !== null && (
                    <>
                      <Box sx={{ flex: 1 }} />
                      <Chip
                        icon={<TimerOutlinedIcon />}
                        label={`${questionTimeLeft}s`}
                        size="small"
                        color={timerColor(questionTimeLeft, test.per_question_seconds || 60)}
                        variant={timerColor(questionTimeLeft, test.per_question_seconds || 60) === 'default' ? 'outlined' : 'filled'}
                        sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}
                      />
                    </>
                  )}
                </Box>

                {/* Question text. A drawing split into parts says how to answer
                    ("Attempt any one of 2") and lists its options, never their
                    solutions: the payload carries none. */}
                <Box sx={{ mb: 2 }}>
                  {currentQuestion.question.drawing_parts ? (
                    <DrawingPartsView parts={currentQuestion.question.drawing_parts} showSolutions={false} />
                  ) : (
                    <MathText
                      text={currentQuestion.question.question_text}
                      variant="body1"
                      sx={{ lineHeight: 1.6, fontSize: { xs: '0.95rem', md: '1rem' } }}
                    />
                  )}
                </Box>

                {/* Question image */}
                {currentQuestion.question.question_image_url && (
                  <Box
                    sx={{
                      mb: 2,
                      display: 'flex',
                      justifyContent: 'flex-start',
                    }}
                  >
                    <Box
                      component="img"
                      src={currentQuestion.question.question_image_url}
                      alt="Question"
                      onClick={() => setQuestionImageZoomed(true)}
                      sx={{
                        display: 'block',
                        width: 'auto',
                        maxWidth: '100%',
                        // Capped well under viewport height so the question text
                        // and first answer options stay visible without scrolling
                        // past the figure on a 375px-tall mobile screen.
                        maxHeight: { xs: 240, md: 320 },
                        objectFit: 'contain',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        // Bank figures are line art on transparent, invisible on a dark card.
                        bgcolor: 'common.white',
                        cursor: 'zoom-in',
                      }}
                      // A figure that does not load makes a spatial-reasoning
                      // question unanswerable, and the student has no way to say
                      // so beyond giving up. This is the single most common and
                      // most fixable failure a paper can have, and until now it
                      // was completely silent.
                      onError={() =>
                        reportTestError({
                          phase: 'image',
                          attempt_id: attempt?.id ?? null,
                          question_id: currentQuestion.question.id,
                          message: 'Question image failed to load',
                          detail: { url: currentQuestion.question.question_image_url },
                        })
                      }
                    />
                  </Box>
                )}

                {/* Options */}
                {isDrawing ? drawingInput : isNumerical ? numericInput : optionCards}
              </>
            )}
          </Box>

          {/* Bottom nav bar (inside content column) */}
          <Box
            sx={{
              px: { xs: 2, sm: 3, md: 4 },
              py: 1,
              borderTop: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              flexShrink: 0,
            }}
          >
            {submitProblemAlert}
            {navButtons}
          </Box>
        </Box>

        {/* -------------------------------------------------------------- */}
        {/* RIGHT: Side panel (desktop only)                                */}
        {/* -------------------------------------------------------------- */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            width: SIDE_PANEL_W,
            flexShrink: 0,
            borderLeft: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
            overflow: 'auto',
          }}
        >
          {/* Timer section (for timed tests, show big timer in panel) */}
          {test.test_type === 'timed' && timeLeftSeconds !== null && (
            <Box sx={{ px: 2, pt: 2, pb: 1.5, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Time Remaining
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  mt: 0.5,
                  color: timerColor(timeLeftSeconds, (test.duration_minutes || 60) * 60) === 'error'
                    ? 'error.main'
                    : timerColor(timeLeftSeconds, (test.duration_minutes || 60) * 60) === 'warning'
                      ? 'warning.main'
                      : 'text.primary',
                }}
              >
                {formatTime(timeLeftSeconds)}
              </Typography>
              <Divider sx={{ mt: 1.5 }} />
            </Box>
          )}

          {/* Question Navigator heading */}
          <Box sx={{ px: 2, pt: test.test_type === 'timed' ? 1 : 2, pb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Questions
            </Typography>
          </Box>

          {/* Question grid */}
          <Box sx={{ px: 2, pb: 2 }}>
            {questionGrid}
          </Box>

          <Divider />

          {/* Summary stats */}
          <Box sx={{ px: 2, py: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1.5, display: 'block' }}>
              Progress
            </Typography>
            {statsSummary}

            {/* Progress bar visual */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {Math.round((answeredCount / questions.length) * 100)}% complete
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(answeredCount / questions.length) * 100}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          </Box>

          {/* Spacer */}
          <Box sx={{ flex: 1 }} />

          {/* Submit button at bottom of side panel */}
          <Box sx={{ px: 2, pb: 2 }}>
            <Button
              variant="contained"
              color="success"
              fullWidth
              endIcon={<SendOutlinedIcon />}
              onClick={() => setSubmitSheetOpen(true)}
              disabled={submitting}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              {submitting ? 'Submitting...' : 'Submit Test'}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ================================================================= */}
      {/* MOBILE: Question Palette Drawer                                    */}
      {/* ================================================================= */}
      <SwipeableDrawer
        anchor="bottom"
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpen={() => setPaletteOpen(true)}
        disableSwipeToOpen
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '60vh',
            bgcolor: 'background.paper',
          },
        }}
      >
        {/* Puller */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
          <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.secondary, 0.3) }} />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            Questions
          </Typography>
          <IconButton size="small" onClick={() => setPaletteOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ px: 2, pb: 1.5 }}>
          {questionGrid}
        </Box>

        <Divider />

        <Box sx={{ px: 2, py: 1.5 }}>
          {statsSummary}
        </Box>
      </SwipeableDrawer>

      {/* ================================================================= */}
      {/* SUBMIT CONFIRMATION (Bottom Sheet)                                 */}
      {/* ================================================================= */}
      <SwipeableDrawer
        anchor="bottom"
        open={submitSheetOpen}
        onClose={() => setSubmitSheetOpen(false)}
        onOpen={() => setSubmitSheetOpen(true)}
        disableSwipeToOpen
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            bgcolor: 'background.paper',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 1 }}>
          <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.secondary, 0.3) }} />
        </Box>

        <Box sx={{ px: 3, pb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <WarningAmberOutlinedIcon color="warning" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Submit Test?
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />
              <Typography variant="body2">
                Answered: <strong>{answeredCount}</strong>
              </Typography>
            </Box>
            {unansweredCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                <Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>
                  Unanswered: {unansweredCount}
                </Typography>
              </Box>
            )}

            {/* Per section, so a student can see they never opened Drawing. On
                a 77-question paper "12 unanswered" does not tell them where. */}
            {sectionRuns.length > 1 &&
              sectionRuns
                .filter((run) => run.answered < run.count)
                .map((run) => (
                  <Box
                    key={`${run.key}-${run.start}`}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 3.5 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {run.label}: {run.answered} of {run.count} answered
                    </Typography>
                  </Box>
                ))}
          </Box>

          {hasNegativeMarking && unansweredCount > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              This paper deducts marks for a wrong answer. A question you leave blank costs you
              nothing, so a guess you are unsure of is worse than no answer.
            </Typography>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Once submitted, you cannot change your answers.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setSubmitSheetOpen(false);
                if (!isDesktop) setPaletteOpen(true);
              }}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Review
            </Button>
            <Button
              variant="contained"
              color="success"
              fullWidth
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {submitting ? 'Submitting...' : 'Confirm Submit'}
            </Button>
          </Box>
        </Box>
      </SwipeableDrawer>

      {/* Snackbar toast */}
      <Snackbar
        open={!!snackMessage}
        autoHideDuration={snackSeverity === 'warning' ? 4000 : 2000}
        onClose={() => setSnackMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 8 }}
      >
        <Alert severity={snackSeverity} variant="filled" onClose={() => setSnackMessage(null)}>
          {snackMessage}
        </Alert>
      </Snackbar>

      {currentQuestion?.question.question_image_url && (
        <ImageViewerDialog
          open={questionImageZoomed}
          onClose={() => setQuestionImageZoomed(false)}
          src={currentQuestion.question.question_image_url}
          alt="Question"
        />
      )}
    </Box>
  );
}
