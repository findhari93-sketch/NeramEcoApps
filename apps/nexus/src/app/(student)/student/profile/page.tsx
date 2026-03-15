'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Chip,
  LinearProgress,
} from '@neram/ui';
import GraphAvatar from '@/components/GraphAvatar';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useGraphProfile } from '@/hooks/useGraphProfile';

interface DashboardData {
  attendanceSummary: { total: number; attended: number; percentage: number };
  checklistProgress: { completed: number; total: number };
  topicProgress: { completed: number; total: number };
}

export default function StudentProfile() {
  const { user, activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();
  const { profile: graphProfile, loading: profileLoading } = useGraphProfile(undefined, true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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
          <GraphAvatar
            self
            name={user?.name}
            size={80}
          />

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

      {/* Microsoft Profile Details */}
      {graphProfile && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Profile Details
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1.5,
            }}
          >
            {graphProfile.department && (
              <Box>
                <Typography variant="caption" color="text.secondary">Batch / Group</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.department}</Typography>
              </Box>
            )}
            {graphProfile.jobTitle && (
              <Box>
                <Typography variant="caption" color="text.secondary">Role</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.jobTitle}</Typography>
              </Box>
            )}
            {graphProfile.officeLocation && (
              <Box>
                <Typography variant="caption" color="text.secondary">Center</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.officeLocation}</Typography>
              </Box>
            )}
            {graphProfile.city && (
              <Box>
                <Typography variant="caption" color="text.secondary">City</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.city}</Typography>
              </Box>
            )}
            {graphProfile.state && (
              <Box>
                <Typography variant="caption" color="text.secondary">State</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.state}</Typography>
              </Box>
            )}
            {graphProfile.country && (
              <Box>
                <Typography variant="caption" color="text.secondary">Country</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.country}</Typography>
              </Box>
            )}
            {graphProfile.employeeId && (
              <Box>
                <Typography variant="caption" color="text.secondary">Student ID</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.employeeId}</Typography>
              </Box>
            )}
            {graphProfile.mobilePhone && (
              <Box>
                <Typography variant="caption" color="text.secondary">Mobile</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{graphProfile.mobilePhone}</Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}
      {profileLoading && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
          <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
        </Paper>
      )}

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
