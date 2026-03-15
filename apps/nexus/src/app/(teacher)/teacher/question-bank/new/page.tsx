'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@neram/database/src/types';
import QuestionFormWizard from '@/components/question-bank/QuestionFormWizard';

export default function AddQuestionPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [topics, setTopics] = useState<NexusQBTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Fetch topics
  useEffect(() => {
    let cancelled = false;

    async function fetchTopics() {
      setTopicsLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/question-bank/topics', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setTopics(json.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch topics:', err);
      } finally {
        if (!cancelled) setTopicsLoading(false);
      }
    }

    fetchTopics();
    return () => { cancelled = true; };
  }, [getToken]);

  async function handleSubmit(
    questionData: Partial<NexusQBQuestion>,
    sources: Partial<NexusQBQuestionSource>[]
  ) {
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/question-bank/questions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...questionData, sources }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to add question');
      }

      setSnackbar({ open: true, message: 'Question added!', severity: 'success' });

      // Navigate after short delay so user sees the snackbar
      setTimeout(() => {
        router.push('/teacher/question-bank/questions');
      }, 800);
    } catch (err) {
      console.error('Failed to add question:', err);
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to add question',
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
          onClick={() => router.push('/teacher/question-bank')}
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Add Question
        </Typography>
      </Box>

      {/* Form */}
      {topicsLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : (
        <QuestionFormWizard
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
