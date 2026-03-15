'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  SwipeableDrawer,
  alpha,
  useTheme,
  useMediaQuery,
  CircularProgress,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
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
  questions: Array<QuizQuestionData & { correct_option: string; explanation: string | null }>;
}

interface QuizModalProps {
  open: boolean;
  sectionTitle: string;
  questions: QuizQuestionData[];
  onClose: () => void;
  onSubmit: (answers: Record<string, string>) => Promise<QuizResult>;
  onRetry: () => void;
  onContinue: () => void;
}

export default function QuizModal({
  open,
  sectionTitle,
  questions,
  onClose,
  onSubmit,
  onRetry,
  onContinue,
}: QuizModalProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleContinue = () => {
    setAnswers({});
    setResult(null);
    onContinue();
  };

  const allAnswered = Object.keys(answers).length >= questions.length;

  const content = (
    <Box sx={{ p: { xs: 2.5, sm: 3 }, maxHeight: '80vh', overflow: 'auto' }}>
      {/* Header */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '1.1rem' }}>
        Section Quiz
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5, fontSize: '0.85rem' }}>
        {sectionTitle}
      </Typography>

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
              Score: {result.correct_count}/{result.total_count} ({result.score_pct}%)
            </Typography>
          </Box>
        </Box>
      )}

      {/* Questions */}
      {questions.map((q, i) => (
        <QuizQuestion
          key={q.id}
          question={q}
          selectedAnswer={answers[q.id]}
          correctAnswer={result?.questions.find(rq => rq.id === q.id)?.correct_option}
          showResult={!!result}
          onChange={handleAnswerChange}
          questionNumber={i + 1}
        />
      ))}

      {/* Explanation after result */}
      {result && result.questions.some(q => q.explanation) && (
        <Box sx={{ mt: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Explanations
          </Typography>
          {result.questions
            .filter(q => q.explanation)
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
          <Button
            variant="contained"
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
            Try Again
          </Button>
        )}
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '85vh',
          },
        }}
      >
        {/* Drag handle */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.text.primary, 0.2),
            }}
          />
        </Box>
        {content}
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '85vh',
        },
      }}
    >
      {content}
    </Dialog>
  );
}
