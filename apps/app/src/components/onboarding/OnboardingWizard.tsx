'use client';

/**
 * OnboardingWizard - Netlify-inspired post-login questionnaire
 *
 * Fullscreen overlay with one question at a time, animated transitions,
 * large tap targets, and a celebration on completion.
 * Mobile-first: designed for 375px+ viewports.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Slide,
  Fade,
  CircularProgress,
} from '@neram/ui';
import type {
  OnboardingQuestion,
  OnboardingQuestionOption,
  OnboardingScaleOptions,
  OnboardingResponseValue,
} from '@neram/database';
import { ScaleQuestion } from './ScaleQuestion';
import { SelectQuestion } from './SelectQuestion';
import { trackFunnelEvent, trackFunnelEventImmediate } from '@/lib/funnel-tracker';

interface OnboardingWizardProps {
  userToken: string;
  userName?: string;
  onComplete: () => void;
  onSkip: () => void;
  sourceApp?: 'marketing' | 'app';
}

export function OnboardingWizard({
  userToken,
  userName,
  onComplete,
  onSkip,
  sourceApp = 'app',
}: OnboardingWizardProps) {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = welcome screen
  const [responses, setResponses] = useState<Map<string, OnboardingResponseValue>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');
  const [slideIn, setSlideIn] = useState(true);

  // Fetch questions on mount
  useEffect(() => {
    async function fetchQuestions() {
      try {
        const res = await fetch('/api/onboarding/questions');
        if (res.ok) {
          const data = await res.json();
          setQuestions(data.questions || []);
        }
      } catch (err) {
        console.error('Failed to fetch onboarding questions:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, []);

  const progress = questions.length > 0
    ? ((currentIndex + 1) / questions.length) * 100
    : 0;

  const currentQuestion = currentIndex >= 0 && currentIndex < questions.length
    ? questions[currentIndex]
    : null;

  const animateTransition = useCallback((direction: 'left' | 'right', callback: () => void) => {
    setSlideIn(false);
    setTimeout(() => {
      setSlideDirection(direction);
      callback();
      setSlideIn(true);
    }, 200);
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      animateTransition('left', () => setCurrentIndex(prev => prev + 1));
    } else {
      // Last question answered — submit
      handleSubmit();
    }
  }, [currentIndex, questions.length, animateTransition]);

  const handleBack = useCallback(() => {
    if (currentIndex > 0) {
      animateTransition('right', () => setCurrentIndex(prev => prev - 1));
    } else if (currentIndex === 0) {
      animateTransition('right', () => setCurrentIndex(-1));
    }
  }, [currentIndex, animateTransition]);

  const handleSelectResponse = useCallback((questionId: string, value: OnboardingResponseValue) => {
    setResponses(prev => {
      const next = new Map(prev);
      next.set(questionId, value);
      return next;
    });
    trackFunnelEvent({ funnel: 'onboarding', event: 'onboarding_question_answered', status: 'completed', metadata: { question_id: questionId, step: currentIndex + 1 } });
    // Auto-advance after a short delay for single_select
    const question = questions.find(q => q.id === questionId);
    if (question?.question_type === 'single_select') {
      setTimeout(() => handleNext(), 400);
    }
  }, [questions, handleNext, currentIndex]);

  const handleStartOnboarding = useCallback(() => {
    trackFunnelEvent({ funnel: 'onboarding', event: 'onboarding_started', status: 'started' });
    animateTransition('left', () => setCurrentIndex(0));
  }, [animateTransition]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const responseArray = Array.from(responses.entries()).map(([question_id, response]) => ({
        question_id,
        response,
      }));

      const res = await fetch('/api/onboarding/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          responses: responseArray,
          source_app: sourceApp,
        }),
      });

      if (res.ok) {
        trackFunnelEventImmediate({ funnel: 'onboarding', event: 'onboarding_completed', status: 'completed', metadata: { questions_answered: responses.size } });
        setCompleted(true);
        setTimeout(onComplete, 2000);
      } else {
        console.error('Submit failed:', res.status);
        onComplete(); // Still proceed on error
      }
    } catch (err) {
      console.error('Submit error:', err);
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    trackFunnelEventImmediate({ funnel: 'onboarding', event: 'onboarding_skipped', status: 'skipped', metadata: { questions_answered: responses.size } });
    setSubmitting(true);
    try {
      await fetch('/api/onboarding/skip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({ source_app: sourceApp }),
      });
    } catch (err) {
      console.error('Skip error:', err);
    } finally {
      setSubmitting(false);
      onSkip();
    }
  };

  if (loading) {
    return (
      <Box sx={overlayStyles}>
        <CircularProgress />
      </Box>
    );
  }

  if (questions.length === 0) {
    // No questions configured — skip silently
    onComplete();
    return null;
  }

  // Completion screen
  if (completed) {
    return (
      <Box sx={overlayStyles}>
        <Fade in timeout={600}>
          <Box sx={{ textAlign: 'center', px: 3 }}>
            <Typography variant="h2" sx={{ mb: 2, fontSize: { xs: '3rem', sm: '4rem' } }}>
              &#127881;
            </Typography>
            <Typography variant="h4" fontWeight="bold" sx={{ mb: 1, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
              You&apos;re all set!
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: { xs: '0.95rem', sm: '1.1rem' } }}>
              Taking you to your dashboard...
            </Typography>
          </Box>
        </Fade>
      </Box>
    );
  }

  return (
    <Box sx={overlayStyles}>
      {/* Progress bar */}
      {currentIndex >= 0 && (
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            '& .MuiLinearProgress-bar': {
              transition: 'transform 0.4s ease',
            },
          }}
        />
      )}

      {/* Skip button */}
      <Button
        onClick={handleSkip}
        disabled={submitting}
        sx={{
          position: 'absolute',
          top: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          color: 'text.secondary',
          fontSize: '0.85rem',
          minHeight: 44,
          '&:hover': { color: 'text.primary' },
        }}
      >
        Skip for now
      </Button>

      {/* Question counter */}
      {currentIndex >= 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            position: 'absolute',
            top: { xs: 24, sm: 32 },
            left: { xs: 16, sm: 24 },
          }}
        >
          {currentIndex + 1} / {questions.length}
        </Typography>
      )}

      {/* Content area */}
      <Box
        sx={{
          width: '100%',
          maxWidth: 600,
          px: { xs: 2, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Slide direction={slideDirection === 'left' ? 'left' : 'right'} in={slideIn} timeout={200}>
          <Box sx={{ width: '100%' }}>
            {currentIndex === -1 ? (
              // Welcome screen
              <WelcomeScreen
                userName={userName}
                onStart={handleStartOnboarding}
              />
            ) : currentQuestion ? (
              // Question screen
              <QuestionScreen
                question={currentQuestion}
                response={responses.get(currentQuestion.id)}
                onSelect={(value) => handleSelectResponse(currentQuestion.id, value)}
                onNext={handleNext}
                onBack={handleBack}
                isFirst={currentIndex === 0}
                isLast={currentIndex === questions.length - 1}
                submitting={submitting}
              />
            ) : null}
          </Box>
        </Slide>
      </Box>
    </Box>
  );
}

// ============================================
// Sub-components
// ============================================

function WelcomeScreen({
  userName,
  onStart,
}: {
  userName?: string;
  onStart: () => void;
}) {
  const greeting = userName ? `Welcome, ${userName.split(' ')[0]}!` : 'Welcome!';

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="h3" fontWeight="bold" sx={{ mb: 2, fontSize: { xs: '1.75rem', sm: '2.5rem' } }}>
        {greeting}
      </Typography>
      <Typography
        color="text.secondary"
        sx={{ mb: 4, fontSize: { xs: '0.95rem', sm: '1.1rem' }, maxWidth: 400, mx: 'auto' }}
      >
        Help us personalize your experience with a few quick questions. It only takes a minute!
      </Typography>
      <Button
        variant="contained"
        size="large"
        onClick={onStart}
        sx={{
          minHeight: 52,
          px: 5,
          fontSize: '1rem',
          borderRadius: 1.5,
        }}
      >
        Let&apos;s Go
      </Button>
    </Box>
  );
}

function QuestionScreen({
  question,
  response,
  onSelect,
  onNext,
  onBack,
  isFirst,
  isLast,
  submitting,
}: {
  question: OnboardingQuestion;
  response?: OnboardingResponseValue;
  onSelect: (value: OnboardingResponseValue) => void;
  onNext: () => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
  submitting: boolean;
}) {
  const hasResponse = !!response;

  return (
    <Box>
      <Typography
        variant="h5"
        fontWeight="bold"
        sx={{
          mb: 3,
          textAlign: 'center',
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          lineHeight: 1.3,
        }}
      >
        {question.question_text}
      </Typography>

      {/* Question body by type */}
      {question.question_type === 'scale' ? (
        <ScaleQuestion
          options={question.options as OnboardingScaleOptions}
          value={response && 'scale' in response ? response.scale : undefined}
          onChange={(scale) => onSelect({ scale })}
        />
      ) : (
        <SelectQuestion
          options={question.options as OnboardingQuestionOption[]}
          value={
            response && 'value' in response
              ? [response.value]
              : response && 'values' in response
              ? response.values
              : []
          }
          multiSelect={question.question_type === 'multi_select'}
          onChange={(selected) => {
            if (question.question_type === 'multi_select') {
              onSelect({ values: selected });
            } else {
              onSelect({ value: selected[0] });
            }
          }}
        />
      )}

      {/* Navigation buttons */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          mt: 4,
          gap: 2,
        }}
      >
        <Button
          onClick={onBack}
          sx={{ minHeight: 48, color: 'text.secondary' }}
        >
          Back
        </Button>

        {/* For multi_select or scale, show explicit Next/Submit button */}
        {(question.question_type === 'multi_select' || question.question_type === 'scale') && (
          <Button
            variant="contained"
            onClick={onNext}
            disabled={!hasResponse || submitting}
            sx={{ minHeight: 48, px: 4, borderRadius: 1 }}
          >
            {submitting ? (
              <CircularProgress size={24} color="inherit" />
            ) : isLast ? (
              'Finish'
            ) : (
              'Next'
            )}
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ============================================
// Styles
// ============================================

const overlayStyles = {
  position: 'fixed' as const,
  inset: 0,
  zIndex: 1400,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: 'background.paper',
  overflow: 'auto',
};
