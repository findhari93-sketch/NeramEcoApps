'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  IconButton,
  Snackbar,
  Alert,
  Skeleton,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type {
  NexusQBTopic,
  NexusQBQuestion,
  NexusQBQuestionSource,
  NexusQBQuestionDetail,
} from '@neram/database/src/types';
import QuestionFormWizard from '@/components/question-bank/QuestionFormWizard';

export default function EditQuestionPage() {
  const router = useRouter();
  const params = useParams();
  const questionId = params.questionId as string;
  const { getToken } = useNexusAuthContext();

  const [question, setQuestion] = useState<NexusQBQuestionDetail | null>(null);
  const [topics, setTopics] = useState<NexusQBTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Fetch question detail and topics in parallel
  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const [questionRes, topicsRes] = await Promise.all([
          fetch(`/api/question-bank/questions/${questionId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/question-bank/topics', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (questionRes.ok) {
          const questionJson = await questionRes.json();
          if (!cancelled) setQuestion(questionJson.data);
        } else {
          console.error('Failed to fetch question:', questionRes.status);
        }

        if (topicsRes.ok) {
          const topicsJson = await topicsRes.json();
          if (!cancelled) setTopics(topicsJson.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [questionId, getToken]);

  async function handleSubmit(
    questionData: Partial<NexusQBQuestion>,
    sources: Partial<NexusQBQuestionSource>[]
  ) {
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`/api/question-bank/questions/${questionId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(questionData),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to update question');
      }

      setSnackbar({ open: true, message: 'Question updated!', severity: 'success' });

      // Navigate after short delay so user sees the snackbar
      setTimeout(() => {
        router.push('/teacher/question-bank/questions');
      }, 800);
    } catch (err) {
      console.error('Failed to update question:', err);
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to update question',
        severity: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
        <IconButton
          onClick={() => router.push('/teacher/question-bank/questions')}
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Edit Question
        </Typography>
      </Box>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : !question ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            Question not found.
          </Typography>
        </Box>
      ) : (
        <QuestionFormWizard
          initialData={question}
          sources={question.sources}
          topics={topics}
          onSubmit={handleSubmit}
          loading={submitting}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
