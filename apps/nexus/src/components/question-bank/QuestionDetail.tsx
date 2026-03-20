'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  Divider,
  alpha,
  useTheme,
  useMediaQuery,
  Fade,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import type { NexusQBQuestionDetail } from '@neram/database';
import SourceBadges from './SourceBadges';
import RepeatBadges from './RepeatBadges';
import DifficultyChip from './DifficultyChip';
import CategoryChips from './CategoryChips';
import MCQOptions from './MCQOptions';
import SolutionSection from './SolutionSection';
import MathText from '@/components/common/MathText';

interface QuestionDetailProps {
  question: NexusQBQuestionDetail;
  mode: 'practice' | 'study';
  onSubmit: (answer: string) => Promise<void>;
  onStudyToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  currentIndex: number;
  totalCount: number;
  inline?: boolean;
}

export default function QuestionDetail({
  question,
  mode,
  onSubmit,
  onStudyToggle,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentIndex,
  totalCount,
  inline = false,
}: QuestionDetailProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [checked, setChecked] = useState(false);

  const isStudyMode = mode === 'study';

  // Study mode: check answer locally without API call
  const handleCheckAnswer = useCallback(() => {
    if (!selectedAnswer) return;
    const correct = selectedAnswer === question.correct_answer;
    setIsCorrect(correct);
    setChecked(true);
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 2000);
  }, [selectedAnswer, question.correct_answer]);

  const handleSubmit = useCallback(async () => {
    if (!selectedAnswer || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(selectedAnswer);
      const correct = selectedAnswer === question.correct_answer;
      setIsCorrect(correct);
      setSubmitted(true);
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 2000);
    } finally {
      setSubmitting(false);
    }
  }, [selectedAnswer, submitting, onSubmit, question.correct_answer]);

  const handleNext = useCallback(() => {
    setSelectedAnswer(null);
    setSubmitted(false);
    setChecked(false);
    setIsCorrect(null);
    setShowFeedback(false);
    onNext();
  }, [onNext]);

  const handlePrev = useCallback(() => {
    setSelectedAnswer(null);
    setSubmitted(false);
    setChecked(false);
    setIsCorrect(null);
    setShowFeedback(false);
    onPrev();
  }, [onPrev]);

  return (
    <Box sx={{ position: 'relative', pb: inline ? 0 : (isMobile ? 10 : 0) }}>
      {/* Navigation header (hidden in inline mode) */}
      {!inline && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <IconButton
            onClick={handlePrev}
            disabled={!hasPrev}
            size="small"
            aria-label="Previous question"
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {currentIndex + 1} / {totalCount}
          </Typography>
          <IconButton
            onClick={handleNext}
            disabled={!hasNext}
            size="small"
            aria-label="Next question"
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <ArrowForwardIcon />
          </IconButton>
        </Box>
      )}

      {/* Source badges */}
      <Box sx={{ mb: 1.5 }}>
        <SourceBadges sources={question.sources} />
      </Box>

      {/* Repeat badges */}
      {question.repeat_sources.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <RepeatBadges sources={question.repeat_sources} />
        </Box>
      )}

      {/* Question image */}
      {question.question_image_url && (
        <>
          <Box
            component="img"
            src={question.question_image_url}
            alt="Question figure"
            onClick={() => setImageZoomed(true)}
            sx={{
              maxWidth: '100%',
              maxHeight: 300,
              borderRadius: 1.5,
              mb: 2,
              cursor: 'zoom-in',
              border: '1px solid',
              borderColor: 'divider',
              objectFit: 'contain',
            }}
          />
          <Dialog
            open={imageZoomed}
            onClose={() => setImageZoomed(false)}
            maxWidth="lg"
            fullWidth
          >
            <Box sx={{ position: 'relative' }}>
              <IconButton
                onClick={() => setImageZoomed(false)}
                sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                aria-label="Close zoomed image"
              >
                <CloseIcon />
              </IconButton>
              <Box
                component="img"
                src={question.question_image_url}
                alt="Question figure (zoomed)"
                sx={{ width: '100%', display: 'block' }}
              />
            </Box>
          </Dialog>
        </>
      )}

      {/* Question text */}
      {question.question_text && (
        <MathText
          text={question.question_text}
          variant="body1"
          sx={{
            mb: 2.5,
            lineHeight: 1.7,
            fontSize: { xs: '0.95rem', md: '1rem' },
          }}
        />
      )}

      {/* MCQ Options */}
      {question.options && question.options.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <MCQOptions
            options={question.options}
            selectedId={selectedAnswer}
            correctId={(isStudyMode ? checked : submitted) ? question.correct_answer : undefined}
            submitted={isStudyMode ? checked : submitted}
            onSelect={setSelectedAnswer}
          />
        </Box>
      )}

      {/* Feedback animation overlay */}
      <Fade in={showFeedback} timeout={300}>
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1300,
            pointerEvents: 'none',
          }}
        >
          {isCorrect ? (
            <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', opacity: 0.9 }} />
          ) : (
            <CancelIcon sx={{ fontSize: 80, color: 'error.main', opacity: 0.9 }} />
          )}
        </Box>
      </Fade>

      {/* Study mode toggle (only after checking answer) */}
      {isStudyMode && checked && (
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={question.is_studied}
                onChange={onStudyToggle}
                color="primary"
              />
            }
            label="Mark as Studied"
            sx={{ ml: 0 }}
          />
        </Box>
      )}

      {/* Solution section (shown after submit in practice, or after check in study) */}
      {(submitted || (isStudyMode && checked)) && (
        <Box sx={{ mb: 3 }}>
          <Divider sx={{ mb: 2 }} />
          <SolutionSection question={question} defaultExpanded={isStudyMode && checked} />
        </Box>
      )}

      {/* Attempt history */}
      {question.attempts.length > 0 && (
        <Accordion
          sx={{
            mb: 2,
            '&:before': { display: 'none' },
            boxShadow: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px !important',
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ minHeight: 48 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Attempt History ({question.attempts.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            {question.attempts.map((attempt, idx) => (
              <Box
                key={attempt.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                  borderBottom:
                    idx < question.attempts.length - 1
                      ? '1px solid'
                      : 'none',
                  borderColor: 'divider',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Attempt {idx + 1}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {new Date(attempt.created_at).toLocaleDateString()}{' '}
                    {attempt.time_spent_seconds
                      ? `(${attempt.time_spent_seconds}s)`
                      : ''}
                  </Typography>
                </Box>
                {attempt.is_correct ? (
                  <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                ) : (
                  <CancelIcon sx={{ color: 'error.main', fontSize: 20 }} />
                )}
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Category + Difficulty footer */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <DifficultyChip difficulty={question.difficulty} />
        <CategoryChips categories={question.categories || []} />
      </Box>

      {/* Study mode: Check Answer button (before checked) */}
      {isStudyMode && !checked && (
        <Box
          sx={{
            position: inline ? 'relative' : (isMobile ? 'fixed' : 'relative'),
            bottom: inline ? 'auto' : (isMobile ? 0 : 'auto'),
            left: 0,
            right: 0,
            p: inline ? 0 : (isMobile ? 2 : 0),
            pt: inline ? 2 : (isMobile ? 1.5 : 2),
            bgcolor: inline ? 'transparent' : (isMobile ? 'background.paper' : 'transparent'),
            borderTop: inline ? 'none' : (isMobile ? '1px solid' : 'none'),
            borderColor: 'divider',
            zIndex: 10,
          }}
        >
          <Button
            variant="contained"
            fullWidth
            disabled={!selectedAnswer}
            onClick={handleCheckAnswer}
            sx={{
              minHeight: 48,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            Check Answer
          </Button>
        </Box>
      )}

      {/* Bottom sticky submit bar (practice mode, mobile) */}
      {!isStudyMode && !submitted && (
        <Box
          sx={{
            position: inline ? 'relative' : (isMobile ? 'fixed' : 'relative'),
            bottom: inline ? 'auto' : (isMobile ? 0 : 'auto'),
            left: 0,
            right: 0,
            p: inline ? 0 : (isMobile ? 2 : 0),
            pt: inline ? 2 : (isMobile ? 1.5 : 2),
            bgcolor: inline ? 'transparent' : (isMobile ? 'background.paper' : 'transparent'),
            borderTop: inline ? 'none' : (isMobile ? '1px solid' : 'none'),
            borderColor: 'divider',
            zIndex: 10,
          }}
        >
          <Button
            variant="contained"
            fullWidth
            disabled={!selectedAnswer || submitting}
            onClick={handleSubmit}
            sx={{
              minHeight: 48,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Answer'}
          </Button>
        </Box>
      )}

      {/* After submit: next button */}
      {!isStudyMode && submitted && hasNext && (
        <Box sx={{ pt: 1 }}>
          <Button
            variant="contained"
            fullWidth
            onClick={handleNext}
            sx={{
              minHeight: 48,
              fontWeight: 600,
              textTransform: 'none',
            }}
          >
            Next Question
          </Button>
        </Box>
      )}
    </Box>
  );
}
