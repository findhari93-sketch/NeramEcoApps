'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Skeleton,
  Chip,
  Button,
  LinearProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import FoundationOverviewCard from '@/components/foundation/FoundationOverviewCard';
import type { NexusFoundationChapterWithProgress } from '@neram/database/types';

interface UpcomingClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  teams_meeting_url: string | null;
  topic: { title: string; category: string } | null;
  teacher: { name: string } | null;
}

interface DashboardData {
  upcomingClasses: UpcomingClass[];
  attendanceSummary: { total: number; attended: number; percentage: number };
  checklistProgress: { completed: number; total: number };
  topicProgress: { completed: number; total: number };
}

export default function StudentDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { user, activeClassroom, getToken, loading: authLoading, classrooms } = useNexusAuthContext();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [foundationChapters, setFoundationChapters] = useState<NexusFoundationChapterWithProgress[] | null>(null);
  const [foundationLoading, setFoundationLoading] = useState(true);

  const noClassrooms = !authLoading && classrooms.length === 0;

  // Fetch foundation progress
  const fetchFoundation = useCallback(async () => {
    setFoundationLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/foundation/chapters', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const fData = await res.json();
        setFoundationChapters(fData.chapters || []);
      }
    } catch (err) {
      console.error('Failed to load foundation:', err);
    } finally {
      setFoundationLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) fetchFoundation();
  }, [authLoading, fetchFoundation]);

  useEffect(() => {
    if (!activeClassroom) {
      if (!authLoading) setLoading(false);
      return;
    }

    async function fetchDashboard() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/dashboard/student?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, [activeClassroom, getToken]);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  };

  const attendancePct = data?.attendanceSummary.percentage ?? 0;
  const checklistPct = data?.checklistProgress.total
    ? Math.round((data.checklistProgress.completed / data.checklistProgress.total) * 100)
    : 0;

  if (noClassrooms) {
    return (
      <Box>
        <PageHeader
          title={`Welcome, ${user?.name?.split(' ')[0] || 'Student'}`}
          subtitle="Getting Started"
        />
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            textAlign: 'center',
          }}
        >
          <SchoolOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            No Classrooms Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
            You haven&apos;t been enrolled in any classrooms yet. Your teacher or administrator will add you to a classroom soon.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] || 'Student'}`}
        subtitle={activeClassroom?.name || 'No classroom selected'}
      />

      {/* Foundation Progress */}
      <FoundationOverviewCard
        chapters={foundationChapters}
        loading={foundationLoading}
        onContinue={(chapterId) => router.push(`/student/foundation/${chapterId}`)}
        onViewAll={() => router.push('/student/foundation')}
      />

      {/* Progress Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          {loading ? (
            <Skeleton variant="rounded" height={110} sx={{ borderRadius: 3 }} />
          ) : (
            <StatCard
              title="Attendance"
              value={`${attendancePct}%`}
              icon={<SchoolOutlinedIcon />}
              variant="gradient"
              subtitle={`${data?.attendanceSummary.attended ?? 0} of ${data?.attendanceSummary.total ?? 0} classes`}
              delay={0}
            />
          )}
        </Grid>
        <Grid item xs={6} sm={3}>
          {loading ? (
            <Skeleton variant="rounded" height={110} sx={{ borderRadius: 3 }} />
          ) : (
            <StatCard
              title="Checklist"
              value={`${data?.checklistProgress.completed ?? 0}/${data?.checklistProgress.total ?? 0}`}
              icon={<ChecklistOutlinedIcon />}
              variant="surface"
              color={theme.palette.success.main}
              delay={80}
            />
          )}
        </Grid>
        <Grid item xs={6} sm={3}>
          {loading ? (
            <Skeleton variant="rounded" height={110} sx={{ borderRadius: 3 }} />
          ) : (
            <StatCard
              title="Topics Done"
              value={`${data?.topicProgress.completed ?? 0}/${data?.topicProgress.total ?? 0}`}
              icon={<MenuBookOutlinedIcon />}
              variant="surface"
              color={theme.palette.warning.main}
              delay={160}
            />
          )}
        </Grid>
        <Grid item xs={6} sm={3}>
          {loading ? (
            <Skeleton variant="rounded" height={110} sx={{ borderRadius: 3 }} />
          ) : (
            <StatCard
              title="Classes Attended"
              value={data?.attendanceSummary.attended ?? 0}
              icon={<EventAvailableOutlinedIcon />}
              variant="outlined"
              color={theme.palette.info.main}
              delay={240}
            />
          )}
        </Grid>
      </Grid>

      {/* Upcoming Classes */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          mb: 2.5,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Upcoming Classes
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2.5 }} />
            ))}
          </Box>
        ) : !data?.upcomingClasses.length ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CalendarTodayOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No upcoming classes scheduled
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {data.upcomingClasses.map((cls, i) => (
              <Paper
                key={cls.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  border: `1px solid ${theme.palette.divider}`,
                  borderLeft: `4px solid ${cls.status === 'completed' ? theme.palette.success.main : theme.palette.primary.main}`,
                  display: 'flex',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1.5,
                  animation: `fadeInUp 350ms cubic-bezier(0.05, 0.7, 0.1, 1) ${i * 60}ms both`,
                  '@keyframes fadeInUp': {
                    from: { opacity: 0, transform: 'translateY(8px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {cls.title}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                    <AccessTimeIcon sx={{ fontSize: '0.8rem', color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary">
                      {cls.scheduled_date} &middot; {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                    </Typography>
                  </Box>
                  {cls.topic && (
                    <Chip
                      label={cls.topic.title}
                      size="small"
                      sx={{
                        mt: 0.75,
                        height: 22,
                        fontSize: '0.675rem',
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        color: 'primary.main',
                        fontWeight: 500,
                      }}
                    />
                  )}
                </Box>
                {cls.teams_meeting_url && cls.status !== 'completed' && (
                  <Button
                    variant="contained"
                    size="small"
                    href={cls.teams_meeting_url}
                    target="_blank"
                    startIcon={<VideocamOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
                    sx={{
                      textTransform: 'none',
                      minHeight: 40,
                      borderRadius: 2,
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      px: 2.5,
                      boxShadow: 'none',
                      '&:hover': { boxShadow: 'none' },
                    }}
                  >
                    Join Class
                  </Button>
                )}
              </Paper>
            ))}
          </Box>
        )}
      </Paper>

      {/* Checklist Progress Bar */}
      {data && data.checklistProgress.total > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Theory Checklist
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {data.checklistProgress.completed}/{data.checklistProgress.total}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={checklistPct}
            sx={{
              height: 10,
              borderRadius: 5,
              bgcolor: alpha(theme.palette.primary.main, 0.08),
              '& .MuiLinearProgress-bar': { borderRadius: 5 },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
            {checklistPct}% completed
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
