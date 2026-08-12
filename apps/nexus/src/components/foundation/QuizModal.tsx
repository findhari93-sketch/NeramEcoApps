'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  alpha,
  useTheme,
  CircularProgress,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import QuizSurface from '@/components/video/QuizSurface';
import QuizQuestion from './QuizQuestion';

interface QuizQuestionData {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

interface QuizResult {
  passed: boolean;
  score_pct: number;
  correct_count: number;
  total_count: number;
  min_questions_to_pass?: number;
  questions: Array<QuizQuestionData & { correct_option: string; explanation: string | null }>;
}

interface QuizModalProps {
  open: boolean;
  sectionTitle: string;
  questions: QuizQuestionData[];
  onClose: () => void;
  onSubmit: (answers: Record<string, string>) => Promise<QuizResult>;
  onRetry: () => void;
  /** In-place retry: reset answers and stay in the drawer (no rewatch) */
  onRetryQuiz?: () => void;
  onContinue: () => void;
  /** If true, the student can dismiss the quiz. Defaults to true. */
  dismissable?: boolean;
  /**
   * The player's container while it is fullscreen, null otherwise. Non-null
   * moves the quiz onto the video instead of the edge of the viewport, which is
   * the only place the browser will paint it while fullscreen. NeramVideoPlayer
   * publishes it through `onFullscreenChange`; see QuizSurface for the rest.
   */
  container?: HTMLElement | null;
  /**
   * The three props below let the caller open this the instant playback stops
   * at a checkpoint, rather than after the questions have arrived.
   *
   * That ordering matters in fullscreen. The loading spinner and the "it did not
   * load" retry used to live on the page below the player, which is off screen
   * while fullscreen, so a slow network showed a paused video with no
   * explanation and a failed fetch showed one forever.
   */
  loadingQuestions?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
}

export default function QuizModal({
  open,
  sectionTitle,
  questions,
  onClose,
  onSubmit,
  onRetry,
  onRetryQuiz,
  onContinue,
  dismissable = true,
  container,
  loadingQuestions = false,
  loadError = null,
  onRetryLoad,
}: QuizModalProps) {
  const theme = useTheme();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // No auto-continue — student clicks "Continue" manually

  const handleAnswerChange = useCallback((questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  }, []);

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) return;
    setSubmitting(true);
    try {
      const quizResult = await onSubmit(answers);
      setResult(quizResult);
    } catch (err) {
      console.error('Quiz submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setResult(null);
    onRetry();
  };

  const handleRetryInPlace = () => {
    setAnswers({});
    setResult(null);
    onRetryQuiz?.();
  };

  const handleContinue = () => {
    setAnswers({});
    setResult(null);
    onContinue();
  };

  const handleDismiss = () => {
    setAnswers({});
    setResult(null);
    onClose();
  };

  const allAnswered = Object.keys(answers).length >= questions.length;

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5 }}>
      <Box sx={{ minWidth: 0 }}>
        {/* Names the thing that stopped the video, so the panel reads as the
            answer to "why did it pause" rather than an unprompted quiz. */}
        {!dismissable && (
          <Typography
            sx={{
              display: 'block',
              fontSize: '0.7rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'primary.main',
              mb: 0.5,
            }}
          >
            Checkpoint
          </Typography>
        )}
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '1.1rem' }}>
          {dismissable ? 'Redo Quiz' : 'Section Quiz'}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
          {sectionTitle}
        </Typography>
      </Box>
      {dismissable && (
        <IconButton
          size="small"
          aria-label="Close the quiz"
          onClick={handleDismiss}
          sx={{ mt: -0.5, mr: -0.5, minWidth: 44, minHeight: 44 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );

  const questionBody = (
    <>
      {/* Instructional message, shown before submission on mandatory quizzes */}
      {!result && !dismissable && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1.5,
            mb: 2,
            bgcolor: alpha(theme.palette.info.main, 0.06),
            border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: '1.1rem', color: theme.palette.info.main, mt: 0.2, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
            Complete this quiz to unlock the next section. You must answer correctly to proceed.
          </Typography>
        </Box>
      )}

      {/* Result banner */}
      {result && (
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            mb: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            bgcolor: result.passed
              ? alpha(theme.palette.success.main, 0.08)
              : alpha(theme.palette.error.main, 0.08),
            border: `1px solid ${result.passed ? alpha(theme.palette.success.main, 0.3) : alpha(theme.palette.error.main, 0.3)}`,
          }}
        >
          {result.passed ? (
            <CheckCircleOutlineIcon sx={{ fontSize: '2rem', color: theme.palette.success.main }} />
          ) : (
            <CancelOutlinedIcon sx={{ fontSize: '2rem', color: theme.palette.error.main }} />
          )}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {result.passed ? 'Great job! You passed!' : 'Not quite. Try again!'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {result.correct_count}/{result.total_count} correct
              {result.min_questions_to_pass
                ? ` (needed ${result.min_questions_to_pass} to pass)`
                : ` (needed all ${result.total_count} to pass)`
              }
            </Typography>
          </Box>
        </Box>
      )}

      {/* Questions */}
      {questions.map((q, i) => {
        const matchedResult = result?.questions?.find(rq => rq.id === q.id);
        // Fallback to index-based matching if ID lookup fails
        const correctOption = matchedResult?.correct_option ?? result?.questions?.[i]?.correct_option;
        return (
          <QuizQuestion
            key={q.id}
            question={q}
            selectedAnswer={answers[q.id]}
            correctAnswer={correctOption}
            showResult={!!result}
            onChange={handleAnswerChange}
            questionNumber={i + 1}
          />
        );
      })}

      {/* Explanation after result */}
      {result && result.questions?.some(q => q.explanation) && (
        <Box sx={{ mt: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Explanations
          </Typography>
          {result.questions
            ?.filter(q => q.explanation)
            .map((q, i) => (
              <Box
                key={q.id}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.info.main, 0.04),
                  border: `1px solid ${alpha(theme.palette.info.main, 0.1)}`,
                  mb: 1,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
                  Q{i + 1}: {q.question_text}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {q.explanation}
                </Typography>
              </Box>
            ))}
        </Box>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 2, justifyContent: 'flex-end' }}>
        {!result ? (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              minHeight: 44,
            }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : `Submit (${Object.keys(answers).length}/${questions.length})`}
          </Button>
        ) : result.passed ? (
          <Button
            variant="contained"
            onClick={handleContinue}
            endIcon={<ArrowForwardIcon />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              minHeight: 44,
            }}
          >
            Continue
          </Button>
        ) : (
          <>
            {onRetryQuiz && (
              <Button
                variant="contained"
                onClick={handleRetryInPlace}
                startIcon={<ReplayIcon />}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 3,
                  minHeight: 44,
                }}
              >
                Retry Quiz
              </Button>
            )}
            <Button
              variant={onRetryQuiz ? 'outlined' : 'contained'}
              onClick={handleRetry}
              startIcon={<ReplayIcon />}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                minHeight: 44,
              }}
            >
              {onRetryQuiz ? 'Rewatch & Retry' : 'Try Again'}
            </Button>
          </>
        )}
      </Box>
    </>
  );

  /**
   * Scrolling belongs to QuizSurface: the drawer Paper and the fullscreen panel
   * each own their own height, and a second scroller in here fought both.
   */
  const content = (
    <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
      {header}
      {loadError ? (
        <LoadFailure message={loadError} onRetry={onRetryLoad} />
      ) : loadingQuestions ? (
        <LoadingQuestions />
      ) : (
        questionBody
      )}
    </Box>
  );

  return (
    <QuizSurface
      open={open}
      container={container}
      dismissable={dismissable}
      onDismiss={handleDismiss}
      ariaLabel={dismissable ? `Redo quiz: ${sectionTitle}` : `Checkpoint quiz: ${sectionTitle}`}
    >
      {content}
    </QuizSurface>
  );
}

function LoadingQuestions() {
  return (
    <Box
      role="status"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}
    >
      <CircularProgress size={22} />
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Getting your checkpoint questions.
      </Typography>
    </Box>
  );
}

/**
 * The retry that used to sit on the page below the player, where a fullscreen
 * student could not see it. One failed fetch was a video that never restarted.
 */
function LoadFailure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const theme = useTheme();
  return (
    <Box role="alert" sx={{ py: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.25,
          p: 2,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.warning.main, 0.08),
          border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
        }}
      >
        <ErrorOutlineIcon sx={{ color: theme.palette.warning.main, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>
            These questions did not load
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {message}
          </Typography>
        </Box>
      </Box>
      {onRetry && (
        <Button
          variant="contained"
          onClick={onRetry}
          startIcon={<ReplayIcon />}
          sx={{ mt: 2, borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3, minHeight: 44 }}
        >
          Try again
        </Button>
      )}
    </Box>
  );
}
