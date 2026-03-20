'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  IconButton,
  Paper,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import QuestionDetail from '@/components/question-bank/QuestionDetail';
import type { NexusQBQuestionDetail } from '@neram/database';

export default function QuestionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const questionId = params.questionId as string;

  const [question, setQuestion] = useState<NexusQBQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Touch swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    if (!activeClassroom || !questionId) return;
    fetchQuestion();
  }, [activeClassroom, questionId]);

  async function fetchQuestion() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${questionId}?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to fetch question');
      const json = await res.json();
      setQuestion(json.data || json);
    } catch (err) {
      console.error('Failed to fetch question:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = useCallback(
    async (answer: string) => {
      if (!activeClassroom || submitting) return;
      setSubmitting(true);
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/question-bank/questions/${questionId}/attempt`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              classroom_id: activeClassroom.id,
              selected_answer: answer,
              mode: 'practice',
            }),
          },
        );
        if (!res.ok) throw new Error('Failed to submit attempt');
        // Refetch question to get updated attempts
        await fetchQuestion();
      } catch (err) {
        console.error('Failed to submit attempt:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [activeClassroom, questionId, submitting],
  );

  const handleReport = useCallback(
    async (reportType: string, description: string) => {
      if (!activeClassroom) return;
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${questionId}/report`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            report_type: reportType,
            description: description || undefined,
            classroom_id: activeClassroom.id,
          }),
        },
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to submit report');
      }
    },
    [activeClassroom, questionId],
  );

  const handleStudyToggle = useCallback(async () => {
    if (!activeClassroom || !question) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${questionId}/study-mark`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            classroom_id: activeClassroom.id,
            is_studied: !question.is_studied,
          }),
        },
      );
      if (!res.ok) throw new Error('Failed to toggle study mark');
      setQuestion((prev: NexusQBQuestionDetail | null) =>
        prev ? { ...prev, is_studied: !prev.is_studied } : prev,
      );
    } catch (err) {
      console.error('Failed to toggle study mark:', err);
    }
  }, [activeClassroom, questionId, question]);

  function handleBack() {
    // Preserve filters by going back to the question list
    const filterParams = new URLSearchParams(searchParams.toString());
    filterParams.delete('mode');
    const qs = filterParams.toString();
    router.push(`/student/question-bank/questions${qs ? '?' + qs : ''}`);
  }

  // Swipe handlers for prev/next navigation (placeholder for future use)
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only trigger on horizontal swipes (|dx| > 50px and |dx| > |dy|)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      // Future: navigate prev/next when question IDs are available
      // if (dx > 0) handlePrev(); else handleNext();
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="text" width={120} sx={{ ml: 2 }} />
        </Box>
        <Skeleton variant="rounded" height={60} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={48} />
      </Box>
    );
  }

  if (!question) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={handleBack} sx={{ minWidth: 48, minHeight: 48 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={600} sx={{ ml: 1 }}>
            Question
          </Typography>
        </Box>
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body1" color="text.secondary">
            Question not found.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Back button header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton
          onClick={handleBack}
          sx={{ minWidth: 48, minHeight: 48 }}
          aria-label="Back to list"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={600} sx={{ ml: 1 }}>
          Question
        </Typography>
      </Box>

      {/* Question Detail */}
      <QuestionDetail
        question={question}
        onSubmit={handleSubmit}
        onStudyToggle={handleStudyToggle}
        onReport={handleReport}
        onNext={() => {}}
        onPrev={() => {}}
        hasNext={false}
        hasPrev={false}
        currentIndex={0}
        totalCount={1}
      />
    </Box>
  );
}
