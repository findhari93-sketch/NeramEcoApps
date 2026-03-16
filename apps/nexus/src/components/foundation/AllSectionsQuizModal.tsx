'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Drawer,
  SwipeableDrawer,
  Divider,
  alpha,
  useTheme,
  useMediaQuery,
  CircularProgress,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import QuizQuestion from './QuizQuestion';
import type { NexusFoundationSectionWithQuiz } from '@neram/database/types';

interface SectionResult {
  sectionId: string;
  sectionTitle: string;
  passed: boolean;
  correct_count: number;
  total_count: number;
  min_questions_to_pass: number;
}

interface AllSectionsQuizModalProps {
  open: boolean;
  sections: NexusFoundationSectionWithQuiz[];
  chapterNumber: number;
  onClose: () => void;
  onSubmitSection: (sectionId: string, answers: Record<string, string>) => Promise<any>;
  onComplete: () => void;
}

export default function AllSectionsQuizModal({
  open,
  sections,
  chapterNumber,
  onClose,
  onSubmitSection,
  onComplete,
}: AllSectionsQuizModalProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<SectionResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only include sections that have questions and haven't been passed
  const pendingSections = sections.filter(
    s => s.quiz_questions.length > 0 && !s.quiz_attempt?.passed
  );

  const allQuestions = pendingSections.flatMap(s => s.quiz_questions);
  const totalQuestions = allQuestions.length;

  const handleAnswerChange = useCallback((questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  }, []);

  const handleSubmitAll = async () => {
    setSubmitting(true);
    try {
      const sectionResults: SectionResult[] = [];

      for (const section of pendingSections) {
        const sectionAnswers: Record<string, string> = {};
        for (const q of section.quiz_questions) {
          if (answers[q.id]) {
            sectionAnswers[q.id] = answers[q.id];
          }
        }

        const result = await onSubmitSection(section.id, sectionAnswers);
        sectionResults.push({
          sectionId: section.id,
          sectionTitle: section.title,
          passed: result.passed,
          correct_count: result.correct_count,
          total_count: result.total_count,
          min_questions_to_pass: result.min_questions_to_pass,
        });
      }

      setResults(sectionResults);
    } catch (err) {
      console.error('Failed to submit all quizzes:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    setAnswers({});
    setResults(null);
    onComplete();
  };

  const allAnswered = Object.keys(answers).length >= totalQuestions;
  const allPassed = results?.every(r => r.passed);

  const content = (
    <Box sx={{ p: { xs: 2.5, sm: 3 }, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
          All Section Quizzes
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
          {pendingSections.length} section{pendingSections.length !== 1 ? 's' : ''} &middot; {totalQuestions} questions total
        </Typography>
      </Box>

      {/* Results banner */}
      {results && (
        <Box sx={{ mb: 2.5 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              mb: 1.5,
              bgcolor: allPassed
                ? alpha(theme.palette.success.main, 0.08)
                : alpha(theme.palette.warning.main, 0.08),
              border: `1px solid ${allPassed ? alpha(theme.palette.success.main, 0.3) : alpha(theme.palette.warning.main, 0.3)}`,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {allPassed ? 'All sections passed! Chapter complete.' : 'Some sections need retry.'}
            </Typography>
            {results.map((r, i) => (
              <Box key={r.sectionId} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {r.passed ? (
                  <CheckCircleOutlineIcon sx={{ fontSize: '1rem', color: theme.palette.success.main }} />
                ) : (
                  <CancelOutlinedIcon sx={{ fontSize: '1rem', color: theme.palette.error.main }} />
                )}
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  {chapterNumber}{String.fromCharCode(65 + sections.findIndex(s => s.id === r.sectionId))} {r.sectionTitle}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
                  {r.correct_count}/{r.total_count}
                  {r.min_questions_to_pass < r.total_count ? ` (needed ${r.min_questions_to_pass})` : ''}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Questions grouped by section */}
      {!results && pendingSections.map((section, sIdx) => {
        const sectionLabel = `${chapterNumber}${String.fromCharCode(65 + sections.findIndex(s => s.id === section.id))}`;
        return (
          <Box key={section.id} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  color: theme.palette.primary.main,
                  fontWeight: 700,
                  fontSize: '0.75rem',
                }}
              >
                {sectionLabel}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {section.title}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
                {section.quiz_questions.length}Q
                {section.min_questions_to_pass
                  ? ` (${section.min_questions_to_pass} to pass)`
                  : ''
                }
              </Typography>
            </Box>

            {section.quiz_questions.map((q, qi) => (
              <QuizQuestion
                key={q.id}
                question={q}
                selectedAnswer={answers[q.id]}
                showResult={false}
                onChange={handleAnswerChange}
                questionNumber={qi + 1}
              />
            ))}

            {sIdx < pendingSections.length - 1 && <Divider sx={{ mt: 2 }} />}
          </Box>
        );
      })}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 2, justifyContent: 'flex-end' }}>
        {!results ? (
          <>
            <Button
              onClick={onClose}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmitAll}
              disabled={!allAnswered || submitting}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                minHeight: 44,
              }}
            >
              {submitting
                ? <CircularProgress size={20} color="inherit" />
                : `Submit All (${Object.keys(answers).length}/${totalQuestions})`
              }
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            onClick={handleDone}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              minHeight: 44,
            }}
          >
            Done
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
            maxHeight: '90vh',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.2) }} />
        </Box>
        {content}
      </SwipeableDrawer>
    );
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { md: 480, lg: 520 },
          maxWidth: '100vw',
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
        },
      }}
    >
      {content}
    </Drawer>
  );
}
