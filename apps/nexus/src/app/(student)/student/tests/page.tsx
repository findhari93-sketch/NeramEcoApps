'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  LinearProgress,
} from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useRouter } from 'next/navigation';

interface TestAttempt {
  id: string;
  status: 'in_progress' | 'submitted' | 'graded';
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  started_at?: string | null;
  submitted_at?: string | null;
}

interface Test {
  id: string;
  title: string;
  test_type: string;
  duration_minutes: number | null;
  question_count: number;
  total_marks: number;
  published_at: string | null;
  is_custom?: boolean;
  myAttempt: TestAttempt | null;
}

export default function StudentTestsPage() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const router = useRouter();
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) return;
    fetchTests();
  }, [activeClassroom]);

  async function fetchTests() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/tests?classroom=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setTests(data.tests || []);
      }
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  }

  function getStatus(test: Test): 'not_started' | 'in_progress' | 'submitted' | 'graded' {
    if (!test.myAttempt) return 'not_started';
    return test.myAttempt.status;
  }

  function isAbandoned(test: Test): boolean {
    if (!test.myAttempt) return false;
    if (test.myAttempt.status !== 'in_progress') return false;
    if (!test.myAttempt.started_at) return false;
    const started = new Date(test.myAttempt.started_at).getTime();
    const now = Date.now();
    const hoursDiff = (now - started) / (1000 * 60 * 60);
    return hoursDiff > 48;
  }

  function getStatusChip(test: Test) {
    if (isAbandoned(test)) {
      return <Chip label="Abandoned" size="small" color="error" />;
    }
    const status = getStatus(test);
    switch (status) {
      case 'not_started':
        return <Chip label="Not Started" size="small" color="default" />;
      case 'in_progress':
        return <Chip label="In Progress" size="small" color="warning" />;
      case 'submitted':
        return <Chip label="Submitted" size="small" color="info" />;
      case 'graded':
        return <Chip label="Graded" size="small" color="success" />;
    }
  }

  function getActionButton(test: Test) {
    const status = getStatus(test);
    switch (status) {
      case 'not_started':
        return (
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrowOutlinedIcon />}
            onClick={() => router.push(`/student/tests/take?test_id=${test.id}`)}
            sx={{ textTransform: 'none', minHeight: 44, minWidth: 120 }}
          >
            Start Test
          </Button>
        );
      case 'in_progress':
        return (
          <Button
            variant="contained"
            color="warning"
            size="small"
            startIcon={<PlayArrowOutlinedIcon />}
            onClick={() => router.push(`/student/tests/take?test_id=${test.id}`)}
            sx={{ textTransform: 'none', minHeight: 44, minWidth: 120 }}
          >
            Resume Test
          </Button>
        );
      case 'submitted':
      case 'graded':
        return (
          <Box sx={{ textAlign: 'right' }}>
            {test.myAttempt?.score != null && test.myAttempt?.total_marks != null && (
              <>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', lineHeight: 1.2 }}>
                  {test.myAttempt.score}/{test.myAttempt.total_marks}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {test.myAttempt.percentage != null ? `${Math.round(test.myAttempt.percentage)}%` : ''}
                </Typography>
              </>
            )}
            {test.myAttempt?.score == null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                <CheckCircleOutlinedIcon fontSize="small" />
                <Typography variant="caption">Awaiting score</Typography>
              </Box>
            )}
          </Box>
        );
    }
  }

  function formatTestType(type: string) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatDuration(minutes: number | null) {
    if (!minutes) return 'Untimed';
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${minutes} min`;
  }

  function renderTestCard(test: Test) {
    return (
      <Paper
        key={test.id}
        variant="outlined"
        sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}
      >
        {/* Header row: title + status chip */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {test.title}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1,
                mt: 0.5,
              }}
            >
              <Chip
                label={formatTestType(test.test_type)}
                size="small"
                variant="outlined"
                sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
              />
              {test.is_custom && (
                <Chip label="Custom" size="small" color="secondary" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              )}
              {getStatusChip(test)}
            </Box>
          </Box>
        </Box>

        {/* Info row: duration, questions, marks */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: { xs: 1.5, sm: 3 },
            color: 'text.secondary',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TimerOutlinedIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption">{formatDuration(test.duration_minutes)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AssignmentOutlinedIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption">{test.question_count} questions</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {test.total_marks} marks
            </Typography>
          </Box>
        </Box>

        {/* Score progress bar for graded tests */}
        {getStatus(test) === 'graded' && test.myAttempt?.percentage != null && (
          <LinearProgress
            variant="determinate"
            value={test.myAttempt.percentage}
            color={test.myAttempt.percentage >= 60 ? 'success' : test.myAttempt.percentage >= 40 ? 'warning' : 'error'}
            sx={{ height: 6, borderRadius: 3 }}
          />
        )}

        {/* Action row */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          {getActionButton(test)}
        </Box>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          Tests
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {activeClassroom?.name || 'No classroom selected'}
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : tests.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No tests available yet.
          </Typography>
        </Paper>
      ) : (
        <>
          {/* My Custom Tests section */}
          {tests.filter((t) => t.is_custom).length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                My Custom Tests
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {tests.filter((t) => t.is_custom).map((test) => renderTestCard(test))}
              </Box>
            </Box>
          )}

          {/* Published Tests section */}
          {tests.filter((t) => !t.is_custom).length > 0 && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Published Tests
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {tests.filter((t) => !t.is_custom).map((test) => renderTestCard(test))}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
