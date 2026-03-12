'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Avatar,
  LinearProgress,
} from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ProgressData {
  child: { id: string; name: string; avatar_url: string | null } | null;
  attendance: { total: number; present: number; percentage: number };
  checklist: { total: number; completed: number; percentage: number };
  drawings: { total: number; approved: number; percentage: number };
  upcomingClasses: { id: string; title: string; start_time: string; end_time: string }[];
}

export default function ParentDashboard() {
  const { user, activeClassroom, getToken } = useNexusAuthContext();
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
    if (pct >= 75) return 'success';
    if (pct >= 50) return 'warning';
    return 'error';
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1, mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Child info header */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar
          src={data?.child?.avatar_url || undefined}
          sx={{ width: 48, height: 48, bgcolor: 'primary.main' }}
        >
          {data?.child?.name?.[0] || 'S'}
        </Avatar>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {data?.child?.name || 'Your Child'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {activeClassroom?.name || 'Classroom'}
          </Typography>
        </Box>
      </Paper>

      {/* Progress cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 2 }}>
        {/* Attendance */}
        <Paper sx={{ p: 1.5, textAlign: 'center' }}>
          <SchoolOutlinedIcon sx={{ fontSize: 24, color: 'primary.main', mb: 0.5 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {data?.attendance.percentage || 0}%
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Attendance
          </Typography>
          <LinearProgress
            variant="determinate"
            value={data?.attendance.percentage || 0}
            color={progressColor(data?.attendance.percentage || 0) as any}
            sx={{ height: 4, borderRadius: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {data?.attendance.present}/{data?.attendance.total}
          </Typography>
        </Paper>

        {/* Checklist */}
        <Paper sx={{ p: 1.5, textAlign: 'center' }}>
          <ChecklistOutlinedIcon sx={{ fontSize: 24, color: 'info.main', mb: 0.5 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {data?.checklist.percentage || 0}%
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Checklist
          </Typography>
          <LinearProgress
            variant="determinate"
            value={data?.checklist.percentage || 0}
            color={progressColor(data?.checklist.percentage || 0) as any}
            sx={{ height: 4, borderRadius: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {data?.checklist.completed}/{data?.checklist.total}
          </Typography>
        </Paper>

        {/* Drawings */}
        <Paper sx={{ p: 1.5, textAlign: 'center' }}>
          <BrushOutlinedIcon sx={{ fontSize: 24, color: 'success.main', mb: 0.5 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {data?.drawings.percentage || 0}%
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Drawings
          </Typography>
          <LinearProgress
            variant="determinate"
            value={data?.drawings.percentage || 0}
            color={progressColor(data?.drawings.percentage || 0) as any}
            sx={{ height: 4, borderRadius: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {data?.drawings.approved}/{data?.drawings.total}
          </Typography>
        </Paper>
      </Box>

      {/* Upcoming classes */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Upcoming Classes
      </Typography>
      {data?.upcomingClasses && data.upcomingClasses.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {data.upcomingClasses.map((cls) => (
            <Paper key={cls.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <EventOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {cls.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(cls.start_time)} &middot; {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      ) : (
        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No upcoming classes this week.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
