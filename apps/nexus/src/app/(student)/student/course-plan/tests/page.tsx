'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  IconButton,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TestCard from '@/components/course-plan/TestCard';

interface TestData {
  id: string;
  title: string;
  description?: string | null;
  scope_description?: string | null;
  scheduled_date?: string | null;
  question_count?: number | null;
  duration_minutes?: number | null;
  test_id?: string | null;
  max_marks?: number | null;
  week?: { id: string; week_number: number; title: string } | null;
}

export default function StudentTestsPage() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId');
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [tests, setTests] = useState<TestData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTests = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}/tests`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setTests(data.tests || []);
      }
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    if (!authLoading) fetchTests();
  }, [authLoading, fetchTests]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const upcomingTests = useMemo(() => {
    return tests.filter((t) => {
      if (!t.scheduled_date) return true; // No date = upcoming by default
      return t.scheduled_date >= todayStr;
    });
  }, [tests, todayStr]);

  const pastTests = useMemo(() => {
    return tests.filter((t) => {
      if (!t.scheduled_date) return false;
      return t.scheduled_date < todayStr;
    });
  }, [tests, todayStr]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={32} width={200} sx={{ mb: 2, borderRadius: 2 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={120} sx={{ mb: 1.5, borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.back()} size="small" sx={{ mr: 0.5 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Tests
        </Typography>
      </Box>

      {tests.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            py: 4,
            textAlign: 'center',
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No tests scheduled yet
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Upcoming Tests */}
          {upcomingTests.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Upcoming Tests
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {upcomingTests.map((test) => (
                  <TestCard key={test.id} test={test} isPast={false} />
                ))}
              </Box>
            </Box>
          )}

          {/* Past Tests */}
          {pastTests.length > 0 && (
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Past Tests
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {pastTests.map((test) => (
                  <TestCard key={test.id} test={test} isPast={true} />
                ))}
              </Box>
            </Box>
          )}

          {/* Edge case: all tests are past and no upcoming */}
          {upcomingTests.length === 0 && pastTests.length > 0 && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 3,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.info.main, 0.05),
                border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                No upcoming tests. Check back when your teacher schedules the next one.
              </Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
