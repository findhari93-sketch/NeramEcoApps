'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Chip,
  Alert,
  IconButton,
  Tabs,
  Tab,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import {
  QB_EXAM_TYPE_LABELS,
  QB_QUESTION_STATUS_LABELS,
  QB_QUESTION_STATUS_COLORS,
} from '@neram/database';
import type { NexusQBOriginalPaper, NexusQBQuestion } from '@neram/database';
import PaperProgressBar from '@/components/question-bank/PaperProgressBar';
import AnswerKeyGrid from '@/components/question-bank/AnswerKeyGrid';

export default function PaperDetailPage() {
  const router = useRouter();
  const params = useParams();
  const paperId = params.id as string;
  const { getToken } = useNexusAuthContext();

  const [paper, setPaper] = useState<NexusQBOriginalPaper | null>(null);
  const [questions, setQuestions] = useState<NexusQBQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setPaper(json.data.paper);
        setQuestions(json.data.questions);
      }
    } catch (err) {
      console.error('Failed to fetch paper:', err);
    } finally {
      setLoading(false);
    }
  }, [paperId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveAnswers = async (
    answers: { question_number: number; correct_answer: string }[]
  ) => {
    setSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/answer-key`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Answers saved');
        await fetchData(); // Refresh
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to save answers');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Questions activated');
        await fetchData();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to activate');
    } finally {
      setActivating(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!paper) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Alert severity="error">Paper not found</Alert>
      </Box>
    );
  }

  const total = paper.questions_parsed || 0;
  const keyed = paper.questions_answer_keyed || 0;
  const complete = paper.questions_complete || 0;
  const draft = total - keyed;
  const answerKeyedOnly = keyed - complete;
  const completeCount = questions.filter((q) => q.status === 'complete').length;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/teacher/question-bank/papers')}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type}
              size="small"
              color="primary"
            />
            <Typography variant="h6" fontWeight={700}>
              {paper.year}
            </Typography>
            {paper.session && (
              <Chip label={paper.session} size="small" variant="outlined" />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Uploaded {formatDate(paper.created_at)}
          </Typography>
        </Box>
      </Box>

      {/* Progress */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <PaperProgressBar
          total={total}
          draft={draft > 0 ? draft : 0}
          answerKeyed={answerKeyedOnly > 0 ? answerKeyedOnly : 0}
          complete={complete}
          active={0}
          showLabels
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5 }}>
          <Typography variant="body2">
            {total} total &middot; {keyed} with answers &middot; {complete} complete
          </Typography>
          {completeCount > 0 && (
            <Button
              variant="contained"
              size="small"
              color="success"
              startIcon={<PlayArrowIcon />}
              onClick={handleActivate}
              disabled={activating}
            >
              {activating ? 'Activating...' : `Activate ${completeCount}`}
            </Button>
          )}
        </Box>
      </Paper>

      {message && (
        <Alert
          severity={message.startsWith('Error') ? 'error' : 'success'}
          sx={{ mb: 2 }}
          onClose={() => setMessage('')}
        >
          {message}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Answer Key" />
        <Tab label={`Questions (${questions.length})`} />
      </Tabs>

      {/* Tab: Answer Key */}
      {tab === 0 && (
        <AnswerKeyGrid questions={questions} onSave={handleSaveAnswers} saving={saving} />
      )}

      {/* Tab: Questions List */}
      {tab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {questions.map((q) => (
            <Paper
              key={q.id}
              variant="outlined"
              sx={{
                p: 1.5,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => router.push(`/teacher/question-bank/questions/${q.id}/edit`)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600} sx={{ minWidth: 30 }}>
                  Q{q.display_order}
                </Typography>
                <Chip
                  label={q.question_format}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem' }}
                />
                <Chip
                  label={QB_QUESTION_STATUS_LABELS[q.status]}
                  size="small"
                  sx={{
                    bgcolor: QB_QUESTION_STATUS_COLORS[q.status] + '20',
                    color: QB_QUESTION_STATUS_COLORS[q.status],
                    fontWeight: 600,
                    fontSize: '0.7rem',
                  }}
                />
                <Box sx={{ flex: 1 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 200,
                  }}
                >
                  {q.question_text || (q.nta_question_id ? `NTA: ${q.nta_question_id}` : 'No content')}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
