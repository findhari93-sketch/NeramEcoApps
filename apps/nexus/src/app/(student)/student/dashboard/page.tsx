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
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
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
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  const noClassrooms = !authLoading && classrooms.length === 0;

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

  // Check if profile is incomplete — quick heuristic first, then API if needed
  useEffect(() => {
    if (authLoading || !user) return;
    // Quick check: if user has phone, profile is likely complete (skip API call)
    if (user.phone) {
      setProfileIncomplete(false);
      return;
    }
    // No phone = likely incomplete, confirm with API
    const checkProfile = async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/student/profile-completion', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setProfileIncomplete(!data.isComplete);
        }
      } catch { /* ignore */ }
    };
    checkProfile();
  }, [authLoading, user, getToken]);

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
  }, [activeClassroom, getToken, authLoading]);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  };

  const attendancePct = data?.attendanceSummary.percentage ?? 0;

  if (noClassrooms) {
    return (
      <Box>
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            Welcome, {user?.name?.split(' ')[0] || 'Student'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Getting Started
          </Typography>
        </Box>
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

  // Determine "Next Up" hero content
  const nextClass = data?.upcomingClasses?.[0];
  const hasUpcomingClassSoon = !!nextClass;

  return (
    <Box>
      {/* ── Compact Greeting ── */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          Welcome, {user?.name?.split(' ')[0] || 'Student'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {activeClassroom?.name || 'No classroom selected'}
        </Typography>
      </Box>

      {/* ── Complete Profile Banner ── */}
      {profileIncomplete && (
        <Paper
          elevation={0}
          sx={{
            mb: 2,
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'warning.light',
            bgcolor: alpha(theme.palette.warning.main, 0.06),
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <PersonOutlineIcon sx={{ fontSize: 32, color: 'warning.main' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={700}>Complete Your Profile</Typography>
            <Typography variant="caption" color="text.secondary">
              Add your phone, academic details, and location so we can serve you better.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            color="warning"
            onClick={() => router.push('/student/complete-profile')}
            sx={{ textTransform: 'none', borderRadius: 1.5, fontWeight: 600, flexShrink: 0 }}
          >
            Complete
          </Button>
        </Paper>
      )}

      {/* ── Foundation Progress ── */}
      <Box sx={{ mb: 2 }}>
        <FoundationOverviewCard
          chapters={foundationChapters}
          loading={foundationLoading}
          onContinue={(chapterId) => router.push(`/student/foundation/${chapterId}`)}
          onViewAll={() => router.push('/student/foundation')}
        />
      </Box>

      {/* ── "Next Up" Hero Card ── */}
      {!loading && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            mb: 2,
            background: hasUpcomingClassSoon
              ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.primary.main, 0.8)} 100%)`
              : `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${alpha(theme.palette.success.main, 0.8)} 100%)`,
            color: '#fff',
            animation: 'fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) both',
            '@keyframes fadeInUp': {
              from: { opacity: 0, transform: 'translateY(12px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {hasUpcomingClassSoon ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: alpha('#fff', 0.85), fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Next Class
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.25, lineHeight: 1.3 }} noWrap>
                  {nextClass.title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <AccessTimeIcon sx={{ fontSize: '0.8rem', color: alpha('#fff', 0.7) }} />
                  <Typography variant="caption" sx={{ color: alpha('#fff', 0.85) }}>
                    {nextClass.scheduled_date} &middot; {formatTime(nextClass.start_time)}
                  </Typography>
                </Box>
              </Box>
              {nextClass.teams_meeting_url && nextClass.status !== 'completed' && (
                <Button
                  variant="contained"
                  size="small"
                  href={nextClass.teams_meeting_url}
                  target="_blank"
                  startIcon={<VideocamOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
                  sx={{
                    textTransform: 'none',
                    minHeight: 40,
                    borderRadius: 2,
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    px: 2,
                    bgcolor: alpha('#fff', 0.2),
                    color: '#fff',
                    boxShadow: 'none',
                    '&:hover': { bgcolor: alpha('#fff', 0.3), boxShadow: 'none' },
                  }}
                >
                  Join
                </Button>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 48, height: 48, borderRadius: 3,
                bgcolor: alpha('#fff', 0.2),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CalendarTodayOutlinedIcon sx={{ fontSize: '1.3rem', color: '#fff' }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: alpha('#fff', 0.85), fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  All caught up!
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  No upcoming classes
                </Typography>
                <Typography variant="caption" sx={{ color: alpha('#fff', 0.8) }}>
                  Check your timetable for the full schedule
                </Typography>
              </Box>
            </Box>
          )}
        </Paper>
      )}
      {loading && (
        <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2, mb: 2 }} />
      )}

      {/* ── Progress Stats: Horizontal scroll on mobile, Grid on desktop ── */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Your Progress
        </Typography>

        {/* Mobile: horizontal scroll strip */}
        <Box
          sx={{
            display: { xs: 'flex', sm: 'none' },
            gap: 1.5,
            overflowX: 'auto',
            mx: -2,
            px: 2,
            pb: 1,
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            '&::-webkit-scrollbar': { display: 'none' },
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
          }}
        >
          {loading ? (
            [1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" width={140} height={80} sx={{ borderRadius: 2, flexShrink: 0 }} />
            ))
          ) : (
            <>
              <Box sx={{ minWidth: 140, flexShrink: 0, scrollSnapAlign: 'start' }}>
                <StatCard
                  title="Attendance"
                  value={`${attendancePct}%`}
                  icon={<SchoolOutlinedIcon />}
                  variant="surface"
                  size="compact"
                  delay={0}
                />
              </Box>
              <Box sx={{ minWidth: 140, flexShrink: 0, scrollSnapAlign: 'start' }}>
                <StatCard
                  title="Checklist"
                  value={`${data?.checklistProgress.completed ?? 0}/${data?.checklistProgress.total ?? 0}`}
                  icon={<ChecklistOutlinedIcon />}
                  variant="surface"
                  color={theme.palette.success.main}
                  size="compact"
                  delay={50}
                />
              </Box>
              <Box sx={{ minWidth: 140, flexShrink: 0, scrollSnapAlign: 'start' }}>
                <StatCard
                  title="Topics Done"
                  value={`${data?.topicProgress.completed ?? 0}/${data?.topicProgress.total ?? 0}`}
                  icon={<MenuBookOutlinedIcon />}
                  variant="surface"
                  color={theme.palette.warning.main}
                  size="compact"
                  delay={100}
                />
              </Box>
              <Box sx={{ minWidth: 140, flexShrink: 0, scrollSnapAlign: 'start' }}>
                <StatCard
                  title="Classes"
                  value={data?.attendanceSummary.attended ?? 0}
                  icon={<EventAvailableOutlinedIcon />}
                  variant="outlined"
                  color={theme.palette.info.main}
                  size="compact"
                  delay={150}
                />
              </Box>
            </>
          )}
        </Box>

        {/* Desktop: 4-column grid */}
        <Grid container spacing={2} sx={{ display: { xs: 'none', sm: 'flex' } }}>
          <Grid item sm={3}>
            {loading ? (
              <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
            ) : (
              <StatCard
                title="Attendance"
                value={`${attendancePct}%`}
                icon={<SchoolOutlinedIcon />}
                variant="surface"
                subtitle={`${data?.attendanceSummary.attended ?? 0} of ${data?.attendanceSummary.total ?? 0} classes`}
                delay={0}
              />
            )}
          </Grid>
          <Grid item sm={3}>
            {loading ? (
              <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
            ) : (
              <StatCard
                title="Checklist"
                value={`${data?.checklistProgress.completed ?? 0}/${data?.checklistProgress.total ?? 0}`}
                icon={<ChecklistOutlinedIcon />}
                variant="surface"
                color={theme.palette.success.main}
                delay={50}
              />
            )}
          </Grid>
          <Grid item sm={3}>
            {loading ? (
              <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
            ) : (
              <StatCard
                title="Topics Done"
                value={`${data?.topicProgress.completed ?? 0}/${data?.topicProgress.total ?? 0}`}
                icon={<MenuBookOutlinedIcon />}
                variant="surface"
                color={theme.palette.warning.main}
                delay={100}
              />
            )}
          </Grid>
          <Grid item sm={3}>
            {loading ? (
              <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
            ) : (
              <StatCard
                title="Classes Attended"
                value={data?.attendanceSummary.attended ?? 0}
                icon={<EventAvailableOutlinedIcon />}
                variant="outlined"
                color={theme.palette.info.main}
                delay={150}
              />
            )}
          </Grid>
        </Grid>
      </Box>

      {/* ── Upcoming Classes ── */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Upcoming Classes
          </Typography>
          <Button
            size="small"
            endIcon={<ArrowForwardIcon sx={{ fontSize: '0.85rem !important' }} />}
            onClick={() => router.push('/student/timetable')}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
          >
            View All
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={68} sx={{ borderRadius: 2.5 }} />
            ))}
          </Box>
        ) : !data?.upcomingClasses.length ? (
          <Paper
            elevation={0}
            sx={{
              py: 2.5,
              textAlign: 'center',
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <CalendarTodayOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 0.75 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              No upcoming classes scheduled
            </Typography>
            <Button
              size="small"
              onClick={() => router.push('/student/timetable')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              View Timetable
            </Button>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.upcomingClasses.map((cls, i) => (
              <Paper
                key={cls.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  border: `1px solid ${theme.palette.divider}`,
                  borderLeft: `4px solid ${cls.status === 'completed' ? theme.palette.success.main : theme.palette.primary.main}`,
                  display: 'flex',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1.5,
                  animation: `fadeInUp 350ms cubic-bezier(0.05, 0.7, 0.1, 1) ${i * 50}ms both`,
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
      </Box>
    </Box>
  );
}
