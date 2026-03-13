'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Avatar,
  alpha,
  useTheme,
  Grid,
} from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StatCard from '@/components/StatCard';

interface ProgressData {
  child: { id: string; name: string; avatar_url: string | null } | null;
  attendance: { total: number; present: number; percentage: number };
  checklist: { total: number; completed: number; percentage: number };
  drawings: { total: number; approved: number; percentage: number };
  upcomingClasses: { id: string; title: string; start_time: string; end_time: string }[];
}

export default function ParentDashboard() {
  const theme = useTheme();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchProgress() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/parent/progress?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('Failed to load progress:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, [activeClassroom, getToken]);

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const progressColor = (pct: number) => {
    if (pct >= 75) return theme.palette.success.main;
    if (pct >= 50) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={80} sx={{ borderRadius: 3, mb: 2 }} />
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={4} key={i}>
              <Skeleton variant="rounded" height={110} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Child Header Card */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 2.5,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          animation: 'fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) both',
          '@keyframes fadeInUp': {
            from: { opacity: 0, transform: 'translateY(12px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        <Avatar
          src={data?.child?.avatar_url || undefined}
          sx={{
            width: 56,
            height: 56,
            bgcolor: alpha('#fff', 0.2),
            color: '#fff',
            fontSize: '1.5rem',
            fontWeight: 700,
            border: `3px solid ${alpha('#fff', 0.3)}`,
          }}
        >
          {data?.child?.name?.[0] || 'S'}
        </Avatar>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {data?.child?.name || 'Your Child'}
          </Typography>
          <Typography variant="body2" sx={{ color: alpha('#fff', 0.7), mt: 0.25 }}>
            {activeClassroom?.name || 'Classroom'}
          </Typography>
        </Box>
      </Paper>

      {/* Progress StatCards */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid item xs={4}>
          <StatCard
            title="Attendance"
            value={`${data?.attendance.percentage || 0}%`}
            icon={<SchoolOutlinedIcon />}
            variant="surface"
            color={progressColor(data?.attendance.percentage || 0)}
            subtitle={`${data?.attendance.present}/${data?.attendance.total}`}
            delay={80}
          />
        </Grid>
        <Grid item xs={4}>
          <StatCard
            title="Checklist"
            value={`${data?.checklist.percentage || 0}%`}
            icon={<ChecklistOutlinedIcon />}
            variant="surface"
            color={progressColor(data?.checklist.percentage || 0)}
            subtitle={`${data?.checklist.completed}/${data?.checklist.total}`}
            delay={160}
          />
        </Grid>
        <Grid item xs={4}>
          <StatCard
            title="Drawings"
            value={`${data?.drawings.percentage || 0}%`}
            icon={<BrushOutlinedIcon />}
            variant="surface"
            color={progressColor(data?.drawings.percentage || 0)}
            subtitle={`${data?.drawings.approved}/${data?.drawings.total}`}
            delay={240}
          />
        </Grid>
      </Grid>

      {/* Upcoming Classes */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Upcoming Classes
        </Typography>

        {data?.upcomingClasses && data.upcomingClasses.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {data.upcomingClasses.map((cls, i) => (
              <Paper
                key={cls.id}
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  border: `1px solid ${theme.palette.divider}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  animation: `fadeInUp 350ms cubic-bezier(0.05, 0.7, 0.1, 1) ${i * 50}ms both`,
                }}
              >
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <EventOutlinedIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {cls.title}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccessTimeIcon sx={{ fontSize: '0.7rem', color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(cls.start_time)} &middot; {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CalendarTodayOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No upcoming classes this week
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
