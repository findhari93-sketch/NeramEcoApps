'use client';

import { useState, useEffect } from 'react';
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
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StatCard from '@/components/StatCard';

interface TodayClass {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  teams_meeting_url: string | null;
  topic: { title: string } | null;
}

interface TeacherDashboardData {
  todayClasses: TodayClass[];
  studentCount: number;
  attendanceTodayCount: number;
  pendingTickets: number;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const theme = useTheme();
  const { user, activeClassroom, getToken, loading: authLoading, classrooms } = useNexusAuthContext();
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const noClassrooms = !authLoading && classrooms.length === 0;

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
          `/api/dashboard/teacher?classroom=${activeClassroom!.id}`,
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

  const firstName = user?.name?.split(' ')[0] || 'Teacher';

  const statusColor = (status: string) => {
    switch (status) {
      case 'live': return theme.palette.error.main;
      case 'completed': return theme.palette.success.main;
      default: return theme.palette.primary.main;
    }
  };

  if (noClassrooms) {
    return (
      <Box>
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            Good {getGreeting()}, {firstName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Welcome to Nexus
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
            No Classrooms Assigned
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto', mb: 2 }}>
            You haven&apos;t been enrolled in any classrooms yet. Ask your administrator to assign you to a classroom, or check back later.
          </Typography>
          <Chip
            label="Contact Admin"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Paper>
      </Box>
    );
  }

  const quickActions = [
    { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon />, color: theme.palette.primary.main },
    { label: 'Attendance', path: '/teacher/attendance', icon: <FactCheckOutlinedIcon />, color: theme.palette.success.main },
    { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon />, color: theme.palette.info.main },
    { label: 'Checklist', path: '/teacher/checklists', icon: <ChecklistOutlinedIcon />, color: theme.palette.warning.main },
  ];

  return (
    <Box>
      {/* ── Compact Greeting ── */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          Good {getGreeting()}, {firstName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {activeClassroom?.name || 'Select a classroom'}
        </Typography>
      </Box>

      {/* ── Stat Cards: Hero + 2 ── */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Hero stat — full width on mobile, 1/3 on tablet+ */}
        <Grid item xs={12} sm={4}>
          {loading ? (
            <Skeleton variant="rounded" height={80} sx={{ borderRadius: 3 }} />
          ) : (
            <StatCard
              title="Classes Today"
              value={data?.todayClasses.length ?? 0}
              icon={<SchoolOutlinedIcon />}
              variant="gradient"
              size="wide"
              delay={0}
              onClick={() => router.push('/teacher/timetable')}
            />
          )}
        </Grid>
        <Grid item xs={6} sm={4}>
          {loading ? (
            <Skeleton variant="rounded" height={80} sx={{ borderRadius: 3 }} />
          ) : (
            <StatCard
              title="Students"
              value={data?.studentCount ?? 0}
              icon={<PeopleOutlinedIcon />}
              variant="surface"
              color={theme.palette.success.main}
              delay={50}
              onClick={() => router.push('/teacher/students')}
            />
          )}
        </Grid>
        <Grid item xs={6} sm={4}>
          {loading ? (
            <Skeleton variant="rounded" height={80} sx={{ borderRadius: 3 }} />
          ) : (
            <StatCard
              title="Open Tickets"
              value={data?.pendingTickets ?? 0}
              icon={<SupportAgentOutlinedIcon />}
              variant="surface"
              color={theme.palette.warning.main}
              delay={100}
            />
          )}
        </Grid>
      </Grid>

      {/* ── Today's Classes ── */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Today&apos;s Classes
          </Typography>
          <Button
            size="small"
            endIcon={<ArrowForwardIcon sx={{ fontSize: '0.85rem !important' }} />}
            onClick={() => router.push('/teacher/timetable')}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
          >
            View All
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={68} sx={{ borderRadius: 2.5 }} />
            ))}
          </Box>
        ) : !data?.todayClasses.length ? (
          <Paper
            elevation={0}
            sx={{
              py: 2.5,
              textAlign: 'center',
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <CalendarTodayOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 0.75 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              No classes scheduled for today
            </Typography>
            <Button
              size="small"
              onClick={() => router.push('/teacher/timetable')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              View Timetable
            </Button>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.todayClasses.map((cls, i) => (
              <Paper
                key={cls.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  border: `1px solid ${theme.palette.divider}`,
                  borderLeft: `4px solid ${statusColor(cls.status)}`,
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
                      {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
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
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    label={cls.status}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '0.675rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      bgcolor: alpha(statusColor(cls.status), 0.1),
                      color: statusColor(cls.status),
                    }}
                  />
                  {cls.teams_meeting_url && cls.status !== 'completed' && (
                    <Button
                      variant="contained"
                      size="small"
                      href={cls.teams_meeting_url}
                      target="_blank"
                      startIcon={<VideocamOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
                      sx={{
                        textTransform: 'none',
                        minHeight: 32,
                        borderRadius: 2,
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        px: 2,
                        boxShadow: 'none',
                        '&:hover': { boxShadow: 'none' },
                      }}
                    >
                      Start
                    </Button>
                  )}
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </Box>

      {/* ── Quick Actions: Horizontal scroll on mobile ── */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Quick Actions
        </Typography>

        {/* Mobile: horizontal scroll */}
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
          {quickActions.map((action) => (
            <Paper
              key={action.path}
              elevation={0}
              onClick={() => router.push(action.path)}
              sx={{
                py: 2,
                px: 2,
                minWidth: 100,
                textAlign: 'center',
                cursor: 'pointer',
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                flexShrink: 0,
                scrollSnapAlign: 'start',
                transition: 'all 200ms ease',
                '&:active': { transform: 'scale(0.96)', bgcolor: alpha(action.color, 0.04) },
              }}
            >
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  bgcolor: alpha(action.color, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1,
                  '& .MuiSvgIcon-root': { fontSize: '1.3rem', color: action.color },
                }}
              >
                {action.icon}
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {action.label}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Desktop: 4-column grid */}
        <Grid container spacing={1.5} sx={{ display: { xs: 'none', sm: 'flex' } }}>
          {quickActions.map((action) => (
            <Grid item xs={6} sm={3} key={action.path}>
              <Paper
                elevation={0}
                onClick={() => router.push(action.path)}
                sx={{
                  py: 2,
                  px: 1.5,
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'all 200ms ease',
                  '&:hover': {
                    borderColor: alpha(action.color, 0.4),
                    bgcolor: alpha(action.color, 0.04),
                    transform: 'translateY(-1px)',
                  },
                  '&:active': { transform: 'scale(0.98)' },
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2.5,
                    bgcolor: alpha(action.color, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 1,
                    '& .MuiSvgIcon-root': { fontSize: '1.3rem', color: action.color },
                  }}
                >
                  {action.icon}
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {action.label}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
