'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Chip,
} from '@neram/ui';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import NavigateBeforeOutlinedIcon from '@mui/icons-material/NavigateBeforeOutlined';
import NavigateNextOutlinedIcon from '@mui/icons-material/NavigateNextOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useSearchParams, useRouter } from 'next/navigation';

interface Option {
  label: string;
  text: string;
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
  test_type: string;
  duration_minutes: number | null;
  total_marks: number;
}

interface AttemptInfo {
  id: string;
  answers: Record<string, string>;
  started_at: string;
}

export default function TakeTestPage() {
  const { getToken } = useNexusAuthContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const testId = searchParams.get('test_id');

  const [test, setTest] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showNavDrawer, setShowNavDrawer] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Timer state
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Fetch test data
  useEffect(() => {
    if (!testId) return;
    fetchTestData();
  }, [testId]);

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
      // Filter out any questions with null question data (safety)
      setQuestions((data.questions || []).filter((q: any) => q.question != null));
      setAttempt(data.attempt);
      setAnswers(data.attempt?.answers || {});

      // Calculate remaining time for timed tests
      if (data.test?.duration_minutes && data.attempt?.started_at) {
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

  // Timer countdown
  useEffect(() => {
    if (timeLeftSeconds === null || timeLeftSeconds <= 0 || submitted) return;

    timerRef.current = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev === null || prev <= 1) {
          // Time's up - auto submit
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
  }, [timeLeftSeconds !== null, submitted]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!attempt || submitted) return;

    autoSaveRef.current = setInterval(() => {
      saveAnswers(answersRef.current, 'save');
    }, 30000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [attempt, submitted]);

  // Prevent back navigation during test
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
    [attempt, getToken]
  );

  function handleAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit(autoSubmit = false) {
    if (submitting) return;
    setSubmitting(true);
    setShowSubmitDialog(false);

    const success = await saveAnswers(answersRef.current, 'submit');
    if (success) {
      setSubmitted(true);
      // Clean up timers
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    }

    setSubmitting(false);
  }

  function formatTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const answeredCount = questions.filter((q) => answers[q.question.id]).length;
  const currentQuestion = questions[currentIndex];
  const isTimeLow = timeLeftSeconds !== null && timeLeftSeconds < 300; // less than 5 min

  // Submitted success screen
  if (submitted) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          bgcolor: 'background.default',
        }}
      >
        <CheckCircleOutlinedIcon sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
          Test Submitted!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1, textAlign: 'center' }}>
          {test?.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
          You answered {answeredCount} of {questions.length} questions.
        </Typography>
        <Button
          variant="contained"
          onClick={() => router.push('/student/tests')}
          sx={{ textTransform: 'none', minHeight: 48, px: 4 }}
        >
          Back to Tests
        </Button>
      </Box>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!test || !attempt || questions.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
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
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {/* Sticky top bar with timer */}
      <Paper
        elevation={2}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderRadius: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {test.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {answeredCount}/{questions.length} answered
          </Typography>
        </Box>

        {timeLeftSeconds !== null && (
          <Chip
            icon={<TimerOutlinedIcon />}
            label={formatTime(timeLeftSeconds)}
            size="small"
            color={isTimeLow ? 'error' : 'default'}
            variant={isTimeLow ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
        )}

        <Button
          variant="outlined"
          size="small"
          onClick={() => setShowNavDrawer(!showNavDrawer)}
          sx={{ minWidth: 40, minHeight: 40, px: 1 }}
        >
          {currentIndex + 1}/{questions.length}
        </Button>
      </Paper>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={(answeredCount / questions.length) * 100}
        sx={{ height: 3 }}
      />

      {/* Question navigation strip (toggled) */}
      {showNavDrawer && (
        <Paper
          elevation={1}
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            borderRadius: 0,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {questions.map((q, idx) => {
            const isAnswered = !!answers[q.question.id];
            const isCurrent = idx === currentIndex;
            return (
              <Box
                key={q.id}
                onClick={() => {
                  setCurrentIndex(idx);
                  setShowNavDrawer(false);
                }}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 2,
                  borderColor: isCurrent ? 'primary.main' : isAnswered ? 'success.main' : 'divider',
                  bgcolor: isAnswered ? 'success.light' : isCurrent ? 'primary.light' : 'transparent',
                  color: isAnswered
                    ? 'success.contrastText'
                    : isCurrent
                      ? 'primary.main'
                      : 'text.secondary',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: 'action.hover' },
                  // Minimum 48px touch target via padding
                  p: 0,
                  m: '3px',
                }}
              >
                {idx + 1}
              </Box>
            );
          })}
        </Paper>
      )}

      {/* Question content area */}
      <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, maxWidth: 720, width: '100%', mx: 'auto' }}>
        {currentQuestion && (
          <>
            {/* Question header */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  px: 1,
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
            </Box>

            {/* Question text */}
            <Typography
              variant="body1"
              sx={{ mb: 2, lineHeight: 1.6, fontWeight: 500, fontSize: { xs: '1rem', sm: '1.05rem' } }}
            >
              {currentQuestion.question.question_text}
            </Typography>

            {/* Question image */}
            {currentQuestion.question.question_image_url && (
              <Box
                sx={{
                  mb: 2,
                  borderRadius: 1,
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

            {/* MCQ options */}
            <RadioGroup
              value={answers[currentQuestion.question.id] || ''}
              onChange={(e) => handleAnswer(currentQuestion.question.id, e.target.value)}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {currentQuestion.question.options.map((option) => (
                  <Paper
                    key={option.label}
                    variant="outlined"
                    onClick={() => handleAnswer(currentQuestion.question.id, option.label)}
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: 2,
                      borderColor:
                        answers[currentQuestion.question.id] === option.label
                          ? 'primary.main'
                          : 'divider',
                      bgcolor:
                        answers[currentQuestion.question.id] === option.label
                          ? 'primary.50'
                          : 'transparent',
                      '&:hover': {
                        borderColor: 'primary.light',
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <FormControlLabel
                      value={option.label}
                      control={
                        <Radio
                          sx={{
                            '& .MuiSvgIcon-root': { fontSize: 24 },
                          }}
                        />
                      }
                      label={
                        <Typography variant="body1" sx={{ py: 0.5 }}>
                          <Box
                            component="span"
                            sx={{ fontWeight: 700, mr: 1, color: 'text.secondary' }}
                          >
                            {option.label}.
                          </Box>
                          {option.text}
                        </Typography>
                      }
                      sx={{
                        m: 0,
                        px: 1.5,
                        py: 1,
                        width: '100%',
                        minHeight: 52,
                        alignItems: 'flex-start',
                        '& .MuiFormControlLabel-label': { flex: 1, pt: 0.25 },
                      }}
                    />
                  </Paper>
                ))}
              </Box>
            </RadioGroup>
          </>
        )}
      </Box>

      {/* Bottom navigation bar */}
      <Paper
        elevation={4}
        sx={{
          position: 'sticky',
          bottom: 0,
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderRadius: 0,
          zIndex: 10,
        }}
      >
        <Button
          variant="outlined"
          size="small"
          startIcon={<NavigateBeforeOutlinedIcon />}
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
        >
          Prev
        </Button>

        {currentIndex < questions.length - 1 ? (
          <Button
            variant="contained"
            size="small"
            endIcon={<NavigateNextOutlinedIcon />}
            onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            size="small"
            endIcon={<SendOutlinedIcon />}
            onClick={() => setShowSubmitDialog(true)}
            disabled={submitting}
            sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        )}
      </Paper>

      {/* Submit confirmation dialog */}
      <Dialog
        open={showSubmitDialog}
        onClose={() => setShowSubmitDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <WarningAmberOutlinedIcon color="warning" />
          Submit Test?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
          </Typography>
          {answeredCount < questions.length && (
            <Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>
              {questions.length - answeredCount} question{questions.length - answeredCount !== 1 ? 's are' : ' is'} unanswered.
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Once submitted, you cannot change your answers.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setShowSubmitDialog(false)}
            sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
          >
            Review Answers
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
          >
            {submitting ? 'Submitting...' : 'Confirm Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
