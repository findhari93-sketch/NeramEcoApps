'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Chip,
  Paper,
  IconButton,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudentHomeworkCard from '@/components/course-plan/StudentHomeworkCard';
import HomeworkSubmitSheet from '@/components/course-plan/HomeworkSubmitSheet';

interface HomeworkItem {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  due_date?: string | null;
  max_points?: number | null;
  sort_order: number;
  session?: {
    id: string;
    day_number: number;
    day_of_week: string;
    slot: string;
    title: string;
  } | null;
  submission?: {
    id: string;
    status: string;
    points_earned?: number | null;
    teacher_feedback?: string | null;
    submitted_at?: string | null;
    attachments?: Array<{ url: string; name: string }>;
  } | null;
}

const FILTER_TABS = ['all', 'pending', 'submitted', 'reviewed'] as const;
type FilterTab = typeof FILTER_TABS[number];

const FILTER_LABELS: Record<FilterTab, string> = {
  all: 'All',
  pending: 'Pending',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
};

export default function StudentHomeworkPage() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId');
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [submitTarget, setSubmitTarget] = useState<HomeworkItem | null>(null);

  const fetchHomework = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}/homework`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setHomework(data.homework || []);
      }
    } catch (err) {
      console.error('Failed to load homework:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    if (!authLoading) fetchHomework();
  }, [authLoading, fetchHomework]);

  const filteredHomework = useMemo(() => {
    if (filter === 'all') return homework;
    if (filter === 'pending') {
      return homework.filter((hw) => !hw.submission || hw.submission.status === 'pending');
    }
    return homework.filter((hw) => hw.submission?.status === filter);
  }, [homework, filter]);

  // Count per filter
  const counts = useMemo(() => ({
    all: homework.length,
    pending: homework.filter((hw) => !hw.submission || hw.submission.status === 'pending').length,
    submitted: homework.filter((hw) => hw.submission?.status === 'submitted').length,
    reviewed: homework.filter((hw) => hw.submission?.status === 'reviewed').length,
  }), [homework]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={32} width={200} sx={{ mb: 2, borderRadius: 2 }} />
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={32} width={80} sx={{ borderRadius: 4 }} />
          ))}
        </Box>
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
          Homework
        </Typography>
      </Box>

      {/* Filter chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          overflowX: 'auto',
          pb: 0.5,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {FILTER_TABS.map((tab) => (
          <Chip
            key={tab}
            label={`${FILTER_LABELS[tab]} (${counts[tab]})`}
            onClick={() => setFilter(tab)}
            variant={filter === tab ? 'filled' : 'outlined'}
            color={filter === tab ? 'primary' : 'default'}
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              height: 32,
              flexShrink: 0,
            }}
          />
        ))}
      </Box>

      {/* Homework list */}
      {filteredHomework.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            py: 4,
            textAlign: 'center',
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <AssignmentOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {filter === 'all' ? 'No homework assigned yet' : `No ${filter} homework`}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredHomework.map((hw) => (
            <StudentHomeworkCard
              key={hw.id}
              homework={hw}
              submission={hw.submission || null}
              onSubmit={() => setSubmitTarget(hw)}
            />
          ))}
        </Box>
      )}

      {/* Submit sheet */}
      <HomeworkSubmitSheet
        open={!!submitTarget}
        onClose={() => setSubmitTarget(null)}
        homework={submitTarget}
        onSubmitted={fetchHomework}
        getToken={getToken}
      />
    </Box>
  );
}
