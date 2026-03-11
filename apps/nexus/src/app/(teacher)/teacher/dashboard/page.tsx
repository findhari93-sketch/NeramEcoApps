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
  Avatar,
  Divider,
} from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

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
  const { user, activeClassroom, getToken } = useNexusAuthContext();
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) return;

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
          Good {getGreeting()}, {user?.name?.split(' ')[0] || 'Teacher'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {activeClassroom?.name || 'Select a classroom'}
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {/* Quick Stats */}
        <Grid item xs={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {loading ? (
              <Skeleton width={40} height={40} sx={{ mx: 'auto' }} />
            ) : (
              <>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {data?.todayClasses.length ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Classes Today
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {loading ? (
              <Skeleton width={40} height={40} sx={{ mx: 'auto' }} />
            ) : (
              <>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {data?.studentCount ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Students
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {loading ? (
              <Skeleton width={40} height={40} sx={{ mx: 'auto' }} />
            ) : (
              <>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'warning.main' }}>
                  {data?.pendingTickets ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Open Tickets
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        {/* Today's Classes */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Today&apos;s Classes
              </Typography>
              <Button
                size="small"
                onClick={() => router.push('/teacher/timetable')}
                sx={{ textTransform: 'none' }}
              >
                View All
              </Button>
            </Box>

            {loading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[1, 2].map((i) => (
                  <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
                ))}
              </Box>
            ) : !data?.todayClasses.length ? (
              <Typography variant="body2" color="text.secondary">
                No classes scheduled for today.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {data.todayClasses.map((cls) => (
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
                        {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                      </Typography>
                      {cls.topic && (
                        <Chip label={cls.topic.title} size="small" sx={{ mt: 0.5 }} />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip
                        label={cls.status}
                        size="small"
                        color={cls.status === 'live' ? 'error' : cls.status === 'completed' ? 'success' : 'default'}
                        sx={{ textTransform: 'capitalize' }}
                      />
                      {cls.teams_meeting_url && cls.status !== 'completed' && (
                        <Button
                          variant="contained"
                          size="small"
                          href={cls.teams_meeting_url}
                          target="_blank"
                          sx={{ textTransform: 'none', minHeight: 32 }}
                        >
                          Start
                        </Button>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Quick Actions
            </Typography>
            <Grid container spacing={1.5}>
              {[
                { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
                { label: 'Attendance', path: '/teacher/attendance', icon: <FactCheckOutlinedIcon /> },
                { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon /> },
                { label: 'Checklist', path: '/teacher/checklist', icon: <ChecklistOutlinedIcon /> },
              ].map((action) => (
                <Grid item xs={6} sm={3} key={action.path}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => router.push(action.path)}
                    sx={{
                      py: 1.5,
                      textTransform: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      minHeight: 64,
                      borderColor: 'divider',
                      color: 'text.primary',
                      '& .MuiSvgIcon-root': { fontSize: '1.5rem', color: 'primary.main' },
                    }}
                  >
                    {action.icon}
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>{action.label}</Typography>
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
