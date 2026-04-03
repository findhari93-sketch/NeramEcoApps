'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import DrillFlashcard from './DrillFlashcard';

interface DrillQuestion {
  id: string;
  question: string;
  answer: string;
  explanation?: string | null;
  frequency?: number | null;
  category?: string | null;
  progress?: { mastered: boolean } | null;
}

interface DrillWidgetProps {
  questions: DrillQuestion[];
  progress: DrillQuestion[];
  planId: string;
  onProgressUpdate: () => void;
  getToken: () => Promise<string | null>;
}

export default function DrillWidget({
  questions,
  progress,
  planId,
  onProgressUpdate,
  getToken,
}: DrillWidgetProps) {
  const theme = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [localMastery, setLocalMastery] = useState<Map<string, boolean>>(new Map());

  // Merge progress data with questions
  const mergedQuestions = useMemo(() => {
    const progressMap = new Map(
      progress.map((p) => [p.id, p.progress?.mastered ?? false])
    );
    return questions.map((q) => ({
      ...q,
      isMastered: localMastery.has(q.id) ? localMastery.get(q.id)! : (progressMap.get(q.id) ?? false),
    }));
  }, [questions, progress, localMastery]);

  // Sort: unmastered first, then mastered
  const sortedQuestions = useMemo(() => {
    const unmastered = mergedQuestions.filter((q) => !q.isMastered);
    const mastered = mergedQuestions.filter((q) => q.isMastered);
    return [...unmastered, ...mastered];
  }, [mergedQuestions]);

  const masteredCount = mergedQuestions.filter((q) => q.isMastered).length;
  const totalCount = mergedQuestions.length;
  const allMastered = totalCount > 0 && masteredCount === totalCount;

  const currentQuestion = sortedQuestions[currentIndex];

  const goToNext = useCallback(() => {
    setFlipped(false);
    setCurrentIndex((prev) => Math.min(prev + 1, sortedQuestions.length - 1));
  }, [sortedQuestions.length]);

  const goToPrev = useCallback(() => {
    setFlipped(false);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleMastery = useCallback(async (mastered: boolean) => {
    if (!currentQuestion) return;

    // Optimistic update
    setLocalMastery((prev) => new Map(prev).set(currentQuestion.id, mastered));

    // Move to next card
    setFlipped(false);
    setTimeout(() => {
      if (currentIndex < sortedQuestions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    }, 200);

    // API call in background
    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/course-plans/${planId}/drill/progress`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          drill_id: currentQuestion.id,
          mastered,
        }),
      });

      onProgressUpdate();
    } catch (err) {
      console.error('Failed to update drill progress:', err);
    }
  }, [currentQuestion, currentIndex, sortedQuestions.length, getToken, planId, onProgressUpdate]);

  if (totalCount === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No drill questions available yet.
        </Typography>
      </Box>
    );
  }

  if (allMastered) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 6,
          px: 3,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.success.main, 0.05),
          border: `2px solid ${alpha(theme.palette.success.main, 0.2)}`,
        }}
      >
        <CelebrationOutlinedIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'success.main' }}>
          All Mastered!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          You&apos;ve mastered all {totalCount} drill questions. Great job!
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Keep reviewing to stay sharp. Come back tomorrow for more practice.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Progress bar */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            {masteredCount}/{totalCount} mastered
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Question {currentIndex + 1} of {sortedQuestions.length}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(masteredCount / totalCount) * 100}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: alpha(theme.palette.success.main, 0.1),
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              bgcolor: 'success.main',
            },
          }}
        />
      </Box>

      {/* Flashcard */}
      {currentQuestion && (
        <DrillFlashcard
          question={currentQuestion}
          isFlipped={flipped}
          onFlip={() => setFlipped(true)}
          onMastered={() => handleMastery(true)}
          onPractice={() => handleMastery(false)}
        />
      )}

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mt: 3 }}>
        <IconButton
          onClick={goToPrev}
          disabled={currentIndex === 0}
          sx={{
            width: 48,
            height: 48,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          {currentIndex + 1} / {sortedQuestions.length}
        </Typography>
        <IconButton
          onClick={goToNext}
          disabled={currentIndex === sortedQuestions.length - 1}
          sx={{
            width: 48,
            height: 48,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <ArrowForwardIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
