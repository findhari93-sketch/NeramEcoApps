'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  alpha,
  useTheme,
} from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import PlaylistPlayOutlinedIcon from '@mui/icons-material/PlaylistPlayOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TodaysPlanCard from '@/components/course-plan/TodaysPlanCard';
import WeeklyOverview from '@/components/course-plan/WeeklyOverview';

interface PlanData {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  duration_weeks: number;
  days_per_week: string[];
  sessions_per_day: Array<{ slot: string; label?: string }>;
  weeks: Array<{
    id: string;
    week_number: number;
    title: string;
    start_date?: string | null;
    end_date?: string | null;
    sessions: SessionData[];
  }>;
  tests: Array<{
    id: string;
    title: string;
    scheduled_date?: string | null;
  }>;
  drill_count: number;
}

interface SessionData {
  id: string;
  day_number: number;
  day_of_week: string;
  slot: string;
  title: string;
  status: string;
  topic?: { id: string; name: string } | null;
  teacher?: { id: string; name: string; avatar_url?: string | null } | null;
  homework_count?: number;
  homework?: Array<{
    id: string;
    title: string;
    type: string;
    max_points?: number | null;
    due_date?: string | null;
  }>;
  scheduled_class?: {
    id: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    status: string;
    meeting_url?: string | null;
  } | null;
}

// Helper to get the short day name for today
function getTodayDayCode(): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[new Date().getDay()];
}

function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StudentCoursePlanPage() {
  const theme = useTheme();
  const router = useRouter();
  const { activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();

  const [plan, setPlan] = useState<PlanData | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [homeworkList, setHomeworkList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWeek, setActiveWeek] = useState(0);

  const fetchPlan = useCallback(async () => {
    if (!activeClassroom) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Get active plans for this classroom
      const plansRes = await fetch(
        `/api/course-plans?classroom_id=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!plansRes.ok) throw new Error('Failed to load plans');
      const plansData = await plansRes.json();
      const activePlan = plansData.plans?.[0];

      if (!activePlan) {
        setPlan(null);
        setLoading(false);
        return;
      }

      // Fetch plan detail and sessions in parallel
      const [detailRes, sessionsRes, homeworkRes] = await Promise.all([
        fetch(`/api/course-plans/${activePlan.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/course-plans/${activePlan.id}/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/course-plans/${activePlan.id}/homework`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (detailRes.ok) {
        const detailData = await detailRes.json();
        setPlan(detailData.plan);
      }
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.sessions || []);
      }
      if (homeworkRes.ok) {
        const hwData = await homeworkRes.json();
        setHomeworkList(hwData.homework || []);
      }
    } catch (err) {
      console.error('Failed to load course plan:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    if (!authLoading) fetchPlan();
  }, [authLoading, fetchPlan]);

  // Determine today's sessions
  const todayCode = getTodayDayCode();
  const todayDate = getTodayDateStr();
  const todaySessions = useMemo(() => {
    return sessions.filter((s) => {
      // Match by scheduled_class date first
      if (s.scheduled_class?.scheduled_date) {
        return s.scheduled_class.scheduled_date === todayDate;
      }
      // Fall back to day_of_week match
      return s.day_of_week === todayCode;
    });
  }, [sessions, todayCode, todayDate]);

  // Homework due today
  const todayHomework = useMemo(() => {
    return homeworkList.filter((hw) => {
      if (!hw.due_date) return false;
      return hw.due_date.startsWith(todayDate);
    });
  }, [homeworkList, todayDate]);

  // Stats for quick action cards
  const pendingHomework = useMemo(() => {
    return homeworkList.filter((hw) => !hw.submission || hw.submission.status === 'pending');
  }, [homeworkList]);

  const nextTest = useMemo(() => {
    if (!plan?.tests) return null;
    const now = new Date();
    return plan.tests.find((t) => t.scheduled_date && new Date(t.scheduled_date) >= now) || null;
  }, [plan]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={32} width={200} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rounded" height={140} sx={{ mb: 2, borderRadius: 2.5 }} />
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={80} sx={{ flex: 1, borderRadius: 2 }} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (!plan) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Course Plan
        </Typography>
        <Paper
          elevation={0}
          sx={{
            py: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <PlaylistPlayOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            No Active Course Plan
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
            Your teacher hasn&apos;t created a course plan yet. Check back soon!
          </Typography>
        </Paper>
      </Box>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <Box>
      {/* Page title */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {plan.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {plan.duration_weeks} weeks &middot; {plan.description || 'Course Plan'}
        </Typography>
      </Box>

      {/* Today's Plan hero card */}
      <Box sx={{ mb: 2 }}>
        <TodaysPlanCard sessions={todaySessions} homework={todayHomework} />
      </Box>

      {/* Quick action cards */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          mb: 2.5,
          overflowX: 'auto',
          mx: { xs: -1, sm: 0 },
          px: { xs: 1, sm: 0 },
          pb: 0.5,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {/* Homework */}
        <Paper
          elevation={0}
          onClick={() => router.push(`/student/course-plan/homework?planId=${plan.id}`)}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            cursor: 'pointer',
            flex: 1,
            minWidth: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            transition: 'border-color 200ms',
            '&:hover': { borderColor: theme.palette.primary.main },
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.warning.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AssignmentOutlinedIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
            Homework
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
            {pendingHomework.length} pending
          </Typography>
        </Paper>

        {/* Drill */}
        <Paper
          elevation={0}
          onClick={() => router.push(`/student/course-plan/drill?planId=${plan.id}`)}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            cursor: 'pointer',
            flex: 1,
            minWidth: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            transition: 'border-color 200ms',
            '&:hover': { borderColor: theme.palette.primary.main },
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.success.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BoltOutlinedIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} />
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
            Drill
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
            {plan.drill_count} questions
          </Typography>
        </Paper>

        {/* Next Test */}
        <Paper
          elevation={0}
          onClick={() => router.push(`/student/course-plan/tests?planId=${plan.id}`)}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            cursor: 'pointer',
            flex: 1,
            minWidth: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            transition: 'border-color 200ms',
            '&:hover': { borderColor: theme.palette.primary.main },
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.error.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <QuizOutlinedIcon sx={{ fontSize: '1.1rem', color: 'error.main' }} />
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
            Next Test
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
            {nextTest?.scheduled_date ? formatDate(nextTest.scheduled_date) : 'TBD'}
          </Typography>
        </Paper>
      </Box>

      {/* Weekly Overview */}
      <WeeklyOverview
        plan={plan}
        sessions={sessions}
        activeWeek={activeWeek}
        onWeekChange={setActiveWeek}
      />
    </Box>
  );
}
