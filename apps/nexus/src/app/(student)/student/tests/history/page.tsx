'use client';

/**
 * Every test this student has ever submitted.
 *
 * Only possible since the cutover put chapter tests, class prep, catch-up,
 * practice and their own papers into one attempt table. Before that a student's
 * record was scattered across six, so there was nothing honest to show.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Divider,
  LinearProgress,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface AttemptRow {
  attempt_id: string;
  test_id: string;
  test_title: string;
  attempt_number: number;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  passed: boolean | null;
  time_spent_seconds: number | null;
  submitted_at: string | null;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export default function StudentTestHistoryPage() {
  const router = useRouter();
  const { getToken, activeClassroom, loading: authLoading } = useNexusAuthContext() as any;

  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [accuracy, setAccuracy] = useState<{ answered: number; correct: number; accuracy_pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const params = activeClassroom?.id ? `?classroom=${activeClassroom.id}&limit=100` : '?limit=100';
      const res = await fetch(`/api/student/tests/history${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not load your results');
      }
      const json = await res.json();
      setAttempts(json.data?.attempts || []);
      setAccuracy(json.data?.accuracy || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your results');
      setAttempts([]);
    }
  }, [getToken, activeClassroom?.id]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto', pb: 8 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
        <IconButton onClick={() => router.push('/student/tests')} aria-label="Back to tests" sx={{ minWidth: 44, minHeight: 44 }}>
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            My results
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Every test you have submitted
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {accuracy && accuracy.answered > 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            OVERALL ACCURACY
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5, mb: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {accuracy.accuracy_pct}%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {accuracy.correct} of {accuracy.answered} questions right
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={accuracy.accuracy_pct}
            color={accuracy.accuracy_pct >= 70 ? 'success' : accuracy.accuracy_pct >= 40 ? 'warning' : 'error'}
            sx={{ height: 8, borderRadius: 4 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Counts your latest answer to each question, so it improves as you fix mistakes.
          </Typography>
        </Paper>
      )}

      {attempts === null ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
          ))}
        </Box>
      ) : attempts.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
          <HistoryOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No results yet. Take a test and it shows up here.
          </Typography>
          <Button variant="outlined" onClick={() => router.push('/student/tests')} sx={{ textTransform: 'none', minHeight: 44 }}>
            Go to tests
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {attempts.map((a, i) => (
            <Box key={a.attempt_id}>
              {i > 0 && <Divider />}
              <Box sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {a.test_title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Attempt {a.attempt_number} · {formatWhen(a.submitted_at)}
                    {a.score != null && a.total_marks != null ? ` · ${a.score}/${a.total_marks}` : ''}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={a.percentage == null ? '-' : `${Math.round(a.percentage)}%`}
                  color={a.passed === true ? 'success' : a.passed === false ? 'default' : 'primary'}
                  sx={{ height: 26, fontWeight: 700, minWidth: 56 }}
                />
                <Button
                  size="small"
                  onClick={() => router.push(`/student/tests/take?test_id=${a.test_id}`)}
                  sx={{ textTransform: 'none', minHeight: 40, flexShrink: 0 }}
                >
                  Retake
                </Button>
              </Box>
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  );
}
