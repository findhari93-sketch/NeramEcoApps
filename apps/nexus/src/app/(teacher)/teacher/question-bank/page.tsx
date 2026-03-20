'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Switch,
  Button,
  Skeleton,
  Chip,
  FormControlLabel,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBQuestionListItem, QBProgressStats } from '@neram/database';
import { QB_DIFFICULTY_COLORS } from '@neram/database';
import DifficultyChip from '@/components/question-bank/DifficultyChip';
import SourceBadges from '@/components/question-bank/SourceBadges';
import MathText from '@/components/common/MathText';

export default function QuestionBankDashboard() {
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [qbEnabled, setQbEnabled] = useState(false);
  const [qbLoading, setQbLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const [stats, setStats] = useState<QBProgressStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [recentQuestions, setRecentQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // Fetch QB enabled status
  useEffect(() => {
    if (!activeClassroom) return;
    let cancelled = false;

    async function fetchLink() {
      setQbLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(
          `/api/question-bank/classroom-link?classroom_id=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setQbEnabled(json.data?.enabled ?? false);
        }
      } catch (err) {
        console.error('Failed to fetch QB link:', err);
      } finally {
        if (!cancelled) setQbLoading(false);
      }
    }

    fetchLink();
    return () => { cancelled = true; };
  }, [activeClassroom, getToken]);

  // Fetch stats
  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setStatsLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/question-bank/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setStats(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch QB stats:', err);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, [getToken]);

  // Fetch recent questions
  useEffect(() => {
    let cancelled = false;

    async function fetchRecent() {
      setRecentLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/question-bank/questions?page_size=10', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setRecentQuestions(json.data?.questions || []);
        }
      } catch (err) {
        console.error('Failed to fetch recent questions:', err);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    }

    fetchRecent();
    return () => { cancelled = true; };
  }, [getToken]);

  async function handleToggle() {
    if (!activeClassroom) return;
    setToggling(true);
    try {
      const token = await getToken();
      if (!token) return;

      const newEnabled = !qbEnabled;
      const method = newEnabled ? 'POST' : 'DELETE';
      const res = await fetch('/api/question-bank/classroom-link', {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classroom_id: activeClassroom.id }),
      });
      if (res.ok) {
        setQbEnabled(newEnabled);
      }
    } catch (err) {
      console.error('Failed to toggle QB:', err);
    } finally {
      setToggling(false);
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2.5 }}>
        Question Bank
      </Typography>

      {/* Classroom QB Toggle */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
        {qbLoading ? (
          <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <QuizOutlinedIcon color={qbEnabled ? 'primary' : 'disabled'} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2">
                Question Bank for {activeClassroom?.name || 'Classroom'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {qbEnabled
                  ? 'Students can access the question bank in this classroom.'
                  : 'Enable to allow students access to the question bank.'}
              </Typography>
            </Box>
            <Switch
              checked={qbEnabled}
              onChange={handleToggle}
              disabled={toggling || !activeClassroom}
            />
          </Box>
        )}
      </Paper>

      {/* Stats Row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
          {statsLoading ? (
            <Skeleton variant="text" width={60} sx={{ mx: 'auto' }} />
          ) : (
            <Typography variant="h4" fontWeight={700} color="primary.main">
              {stats?.total_questions ?? 0}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Total Questions
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
          {statsLoading ? (
            <Skeleton variant="text" width={60} sx={{ mx: 'auto' }} />
          ) : (
            <Typography variant="h4" fontWeight={700} color="success.main">
              {stats?.attempted_count ?? 0}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            With Answer Key
          </Typography>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2, gridColumn: { xs: '1 / -1', md: 'auto' } }}
        >
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            By Difficulty
          </Typography>
          {statsLoading ? (
            <Skeleton variant="text" width="80%" />
          ) : stats?.by_difficulty ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {Object.entries(stats.by_difficulty).map(([diff, data]: [string, { attempted: number; correct: number; total: number }]) => (
                <Typography key={diff} variant="body2">
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: QB_DIFFICULTY_COLORS[diff as keyof typeof QB_DIFFICULTY_COLORS] || '#999',
                      mr: 0.75,
                    }}
                  />
                  {diff}: {data.total}
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No data
            </Typography>
          )}
        </Paper>
      </Box>

      {/* Quick Actions */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Paper
          variant="outlined"
          onClick={() => router.push('/teacher/question-bank/new')}
          sx={{
            p: 2,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <AddOutlinedIcon color="primary" sx={{ fontSize: 32, mb: 0.5 }} />
          <Typography variant="subtitle2">Add Question</Typography>
        </Paper>
        <Paper
          variant="outlined"
          onClick={() => router.push('/teacher/question-bank/questions')}
          sx={{
            p: 2,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <ListAltOutlinedIcon color="primary" sx={{ fontSize: 32, mb: 0.5 }} />
          <Typography variant="subtitle2">All Questions</Typography>
        </Paper>
        <Paper
          variant="outlined"
          onClick={() => router.push('/teacher/question-bank/bulk-upload')}
          sx={{
            p: 2,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <UploadFileOutlinedIcon color="primary" sx={{ fontSize: 32, mb: 0.5 }} />
          <Typography variant="subtitle2">Bulk Upload</Typography>
        </Paper>
        <Paper
          variant="outlined"
          onClick={() => router.push('/teacher/question-bank/papers')}
          sx={{
            p: 2,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <DescriptionOutlinedIcon color="primary" sx={{ fontSize: 32, mb: 0.5 }} />
          <Typography variant="subtitle2">Papers</Typography>
        </Paper>
      </Box>

      {/* Recent Additions */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Recent Additions
      </Typography>
      {recentLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : recentQuestions.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <QuizOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No questions yet. Add your first question to get started!
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {recentQuestions.map((q) => (
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
              <Box
                sx={{
                  mb: 0.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {q.question_text ? (
                  <MathText text={q.question_text} variant="body2" />
                ) : (
                  <Typography variant="body2">Image-based question</Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <SourceBadges sources={q.sources} />
                <DifficultyChip difficulty={q.difficulty} size="small" />
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="caption" color="text.secondary">
                  {formatDate(q.created_at)}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
