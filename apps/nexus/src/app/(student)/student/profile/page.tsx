'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Avatar,
  Chip,
  LinearProgress,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface DashboardData {
  attendanceSummary: { total: number; attended: number; percentage: number };
  checklistProgress: { completed: number; total: number };
  topicProgress: { completed: number; total: number };
}

export default function StudentProfile() {
  const { user, activeClassroom, getToken } = useNexusAuthContext();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) return;

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
          setDashboardData(await res.json());
        }
      } catch (err) {
        console.error('Failed to load profile data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, [activeClassroom, getToken]);

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 3 }}>
        My Profile
      </Typography>

      {/* User Info Card */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'center', sm: 'flex-start' },
            gap: 2,
          }}
        >
          <Avatar
            src={user?.avatar_url || undefined}
            alt={user?.name || 'User'}
            sx={{ width: 80, height: 80, fontSize: 28, fontWeight: 700 }}
          >
            {getInitials(user?.name)}
          </Avatar>

          <Box sx={{ textAlign: { xs: 'center', sm: 'left' }, flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {user?.name || 'Student'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {user?.email || 'No email'}
            </Typography>
            {user?.user_type && (
              <Chip
                label={user.user_type}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ textTransform: 'capitalize' }}
              />
            )}
          </Box>
        </Box>
      </Paper>

      {/* Active Classroom */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Active Classroom
        </Typography>
        {activeClassroom ? (
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {activeClassroom.name}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No classroom selected
          </Typography>
        )}
      </Paper>

      {/* Attendance & Progress */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Attendance & Progress
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
            <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
          </Box>
        ) : !dashboardData ? (
          <Typography variant="body2" color="text.secondary">
            No data available.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Attendance */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  Attendance
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {dashboardData.attendanceSummary.percentage}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={dashboardData.attendanceSummary.percentage}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {dashboardData.attendanceSummary.attended} of {dashboardData.attendanceSummary.total} classes attended
              </Typography>
            </Box>

            {/* Checklist Progress */}
            {dashboardData.checklistProgress.total > 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Checklist
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                    {dashboardData.checklistProgress.completed}/{dashboardData.checklistProgress.total}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={
                    (dashboardData.checklistProgress.completed / dashboardData.checklistProgress.total) * 100
                  }
                  color="success"
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}

            {/* Topic Progress */}
            {dashboardData.topicProgress.total > 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Topics Completed
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.main' }}>
                    {dashboardData.topicProgress.completed}/{dashboardData.topicProgress.total}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={
                    (dashboardData.topicProgress.completed / dashboardData.topicProgress.total) * 100
                  }
                  color="warning"
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
