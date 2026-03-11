'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Skeleton,
  Chip,
  LinearProgress,
  Button,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

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
  const { user, activeClassroom, getToken } = useNexusAuthContext();
  const [data, setData] = useState<DashboardData | null>(null);
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

  return (
    <Box>
      {/* Welcome Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          Welcome, {user?.name?.split(' ')[0] || 'Student'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {activeClassroom?.name || 'No classroom selected'}
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {/* Progress Summary Cards */}
        <Grid item xs={6} sm={4} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {loading ? (
              <Skeleton variant="circular" width={48} height={48} sx={{ mx: 'auto', mb: 1 }} />
            ) : (
              <>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {data?.attendanceSummary.percentage ?? 0}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Attendance
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={6} sm={4} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {loading ? (
              <Skeleton variant="circular" width={48} height={48} sx={{ mx: 'auto', mb: 1 }} />
            ) : (
              <>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {data?.checklistProgress.completed ?? 0}/{data?.checklistProgress.total ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Checklist
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={6} sm={4} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {loading ? (
              <Skeleton variant="circular" width={48} height={48} sx={{ mx: 'auto', mb: 1 }} />
            ) : (
              <>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'warning.main' }}>
                  {data?.topicProgress.completed ?? 0}/{data?.topicProgress.total ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Topics Done
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={6} sm={4} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {loading ? (
              <Skeleton variant="circular" width={48} height={48} sx={{ mx: 'auto', mb: 1 }} />
            ) : (
              <>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'info.main' }}>
                  {data?.attendanceSummary.attended ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Classes Attended
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        {/* Upcoming Classes */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Upcoming Classes
            </Typography>

            {loading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
                ))}
              </Box>
            ) : !data?.upcomingClasses.length ? (
              <Typography variant="body2" color="text.secondary">
                No upcoming classes scheduled.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {data.upcomingClasses.map((cls) => (
                  <Paper
                    key={cls.id}
                    variant="outlined"
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      flexDirection: { xs: 'column', sm: 'row' },
                      gap: 1,
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {cls.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {cls.scheduled_date} &middot; {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                      </Typography>
                      {cls.topic && (
                        <Chip
                          label={cls.topic.title}
                          size="small"
                          sx={{ mt: 0.5, textTransform: 'capitalize' }}
                        />
                      )}
                    </Box>
                    {cls.teams_meeting_url && cls.status !== 'completed' && (
                      <Button
                        variant="contained"
                        size="small"
                        href={cls.teams_meeting_url}
                        target="_blank"
                        sx={{
                          minWidth: 100,
                          textTransform: 'none',
                          minHeight: 40,
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
        </Grid>

        {/* Checklist Progress Bar */}
        {data && data.checklistProgress.total > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: { xs: 2, sm: 3 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  Theory Checklist
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.checklistProgress.completed}/{data.checklistProgress.total} completed
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={
                  data.checklistProgress.total > 0
                    ? (data.checklistProgress.completed / data.checklistProgress.total) * 100
                    : 0
                }
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
