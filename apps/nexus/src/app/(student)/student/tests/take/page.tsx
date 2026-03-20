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
  IconButton,
  Divider,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import NavigateBeforeOutlinedIcon from '@mui/icons-material/NavigateBeforeOutlined';
import NavigateNextOutlinedIcon from '@mui/icons-material/NavigateNextOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useSearchParams, useRouter } from 'next/navigation';
import MathText from '@/components/common/MathText';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Option {
  id?: string;
  label?: string;
  text: string;
  image_url?: string;
}

interface Question {
  id: string;
  sort_order: number;
  marks: number;
  question: {
    id: string;
    question_text: string;
    question_image_url: string | null;
    question_type: string;
    options: Option[];
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TakeTestPage() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { getToken } = useNexusAuthContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const testId = searchParams.get('test_id');

  // Core state
  const [test, setTest] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // UI state
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // Timers
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Swipe tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!testId) return;
    fetchTestData();
  }, [testId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTestData() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/tests/attempt?test_id=${testId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.error('Failed to load test:', res.status);
        return;
      }

      const data = await res.json();
      setTest(data.test);
      setQuestions((data.questions || []).filter((q: any) => q.question != null));
      setAttempt(data.attempt);
      setAnswers(data.attempt?.answers || {});

      if (data.test?.test_type === 'timed' && data.test?.duration_minutes && data.attempt?.started_at) {
        const startedAt = new Date(data.attempt.started_at).getTime();
        const durationMs = data.test.duration_minutes * 60 * 1000;
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, Math.floor((durationMs - elapsed) / 1000));
        setTimeLeftSeconds(remaining);
      }
    } catch (err) {
      console.error('Failed to load test:', err);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Full-test timer countdown
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (timeLeftSeconds === null || timeLeftSeconds <= 0 || submitted) return;

    timerRef.current = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeftSeconds !== null, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Per-question timer countdown
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!test?.per_question_seconds || test.test_type !== 'per_question_timer' || submitted) return;

    setQuestionTimeLeft(test.per_question_seconds);

    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
          setSnackMessage("Time's up! Moving to next question...");
          if (currentIndex < questions.length - 1) {
            setCurrentIndex((i) => i + 1);
          } else {
            handleSubmit(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [currentIndex, test?.per_question_seconds, test?.test_type, submitted, questions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Auto-save every 30 seconds
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!attempt || submitted) return;

    autoSaveRef.current = setInterval(() => {
      saveAnswers(answersRef.current, 'save');
    }, 30000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [attempt, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Prevent back navigation during test
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (submitted || loading) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [submitted, loading]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const saveAnswers = useCallback(
    async (currentAnswers: Record<string, string>, action: 'save' | 'submit') => {
      if (!attempt) return false;
      try {
        const token = await getToken();
        if (!token) return false;

        const res = await fetch('/api/tests/attempt', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            attempt_id: attempt.id,
            answers: currentAnswers,
            action,
          }),
        });
        return res.ok;
      } catch (err) {
        console.error('Failed to save answers:', err);
        return false;
      }
    },
    [attempt, getToken],
  );

  function handleAnswer(questionId: string, value: string) {
    // Per-question timer: can't answer past questions
    if (isPerQuestion) {
      const qIdx = questions.findIndex((q) => q.question.id === questionId);
      if (qIdx < currentIndex) return;
    }
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit(autoSubmit = false) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitSheetOpen(false);

    const success = await saveAnswers(answersRef.current, 'submit');
    if (success) {
      setSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    }

    setSubmitting(false);
  }

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
  const currentQuestion = questions[currentIndex];

  // =========================================================================
  // RENDER: Submitted success screen
  // =========================================================================

  if (submitted) {
    const scoreFromAttempt = (attempt as any)?.score;
    const totalFromAttempt = (attempt as any)?.total_marks;
    const percentFromAttempt = (attempt as any)?.percentage;
    const timeSpent = (attempt as any)?.time_spent_seconds;

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
          bgcolor: 'background.default',
          overflow: 'auto',
        }}
      >
        <CheckCircleOutlinedIcon sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, textAlign: 'center' }}>
          Test Submitted!
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
          {test?.title}
        </Typography>

        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 360,
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            overflow: 'hidden',
            mb: 3,
          }}
        >
          {scoreFromAttempt !== undefined && totalFromAttempt !== undefined && (
            <Box
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                px: 2.5,
                py: 2,
                textAlign: 'center',
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
                {scoreFromAttempt}/{totalFromAttempt}
              </Typography>
              {percentFromAttempt !== undefined && (
                <Typography variant="body2" color="text.secondary">
                  {percentFromAttempt}%
                </Typography>
              )}
            </Box>
          )}

          <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Answered</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                {answeredCount}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Unanswered</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: unansweredCount > 0 ? 'warning.main' : 'text.secondary' }}>
                {unansweredCount}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Total Questions</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{questions.length}</Typography>
            </Box>
            {timeSpent && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Time Spent</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatTime(timeSpent)}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>

        <Button
          variant="contained"
          onClick={() => router.push('/student/tests')}
          sx={{ textTransform: 'none', minHeight: 48, px: 4, borderRadius: 2 }}
        >
          Back to Tests
        </Button>
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
            Unable to load test. Please go back and try again.
          </Typography>
          <Button
            variant="outlined"
            onClick={() => router.push('/student/tests')}
            sx={{ mt: 2, textTransform: 'none', minHeight: 48 }}
          >
            Back to Tests
          </Button>
        </Box>
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

  // ----- Shared: Option cards -----
  const optionCards = currentQuestion ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.75, md: 1 } }}>
      {(currentQuestion.question.options || []).map((option, optIdx) => {
        const optionKey = option.label || option.id || String(optIdx);
        const displayLetter = option.label || String.fromCharCode(65 + optIdx);
        const isSelected = selectedAnswer === optionKey;
        return (
          <Paper
            key={optionKey}
            elevation={0}
            onClick={() => handleAnswer(currentQuestion.question.id, optionKey)}
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
              alignItems: 'center',
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
                fontWeight: 700,
                fontSize: '0.8rem',
                transition: 'all 120ms ease',
                bgcolor: isSelected ? 'primary.main' : alpha(theme.palette.text.secondary, 0.08),
                color: isSelected ? 'primary.contrastText' : 'text.secondary',
              }}
            >
              {displayLetter}
            </Box>

            {/* Option text */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <MathText text={option.text} variant="body2" sx={{ fontSize: { xs: '0.875rem', md: '0.95rem' } }} />
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

                {/* Question text */}
                <Box sx={{ mb: 2 }}>
                  <MathText
                    text={currentQuestion.question.question_text}
                    variant="body1"
                    sx={{ lineHeight: 1.6, fontSize: { xs: '0.95rem', md: '1rem' } }}
                  />
                </Box>

                {/* Question image */}
                {currentQuestion.question.question_image_url && (
                  <Box
                    sx={{
                      mb: 2,
                      borderRadius: 2,
                      overflow: 'hidden',
                      maxWidth: 480,
                    }}
                  >
                    <img
                      src={currentQuestion.question.question_image_url}
                      alt="Question"
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                  </Box>
                )}

                {/* Options */}
                {optionCards}
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
          </Box>

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
        autoHideDuration={2000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 8 }}
      />
    </Box>
  );
}
