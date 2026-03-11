'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Skeleton,
  Tabs,
  Tab,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ScheduledClass {
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

export default function StudentTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekDates = (offset: number) => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
      label: `${monday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`,
    };
  };

  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchClasses() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const week = getWeekDates(weekOffset);
        const res = await fetch(
          `/api/timetable?classroom=${activeClassroom!.id}&start=${week.start}&end=${week.end}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setClasses(data.classes || []);
        }
      } catch (err) {
        console.error('Failed to load timetable:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchClasses();
  }, [activeClassroom, weekOffset, getToken]);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const week = getWeekDates(weekOffset);

  // Group classes by date
  const classesByDate = classes.reduce<Record<string, ScheduledClass[]>>((acc, cls) => {
    if (!acc[cls.scheduled_date]) acc[cls.scheduled_date] = [];
    acc[cls.scheduled_date].push(cls);
    return acc;
  }, {});

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Timetable
      </Typography>

      {/* Week Navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Button size="small" onClick={() => setWeekOffset((w) => w - 1)} sx={{ textTransform: 'none' }}>
          ← Prev
        </Button>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {week.label}
        </Typography>
        <Button size="small" onClick={() => setWeekOffset((w) => w + 1)} sx={{ textTransform: 'none' }}>
          Next →
        </Button>
      </Box>

      {/* Classes by Day */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : Object.keys(classesByDate).length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No classes scheduled for this week.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.entries(classesByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dayClasses]) => (
              <Box key={date}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>
                  {formatDate(date)}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {dayClasses.map((cls) => (
                    <Paper
                      key={cls.id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        flexDirection: { xs: 'column', sm: 'row' },
                        gap: 1,
                        borderLeft: `4px solid`,
                        borderLeftColor:
                          cls.status === 'completed' ? 'success.main' :
                          cls.status === 'live' ? 'error.main' :
                          cls.status === 'cancelled' ? 'text.disabled' :
                          'primary.main',
                      }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {cls.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                          {cls.teacher && ` · ${cls.teacher.name}`}
                        </Typography>
                        {cls.topic && (
                          <Chip label={cls.topic.title} size="small" sx={{ mt: 0.5 }} />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Chip
                          label={cls.status}
                          size="small"
                          color={
                            cls.status === 'completed' ? 'success' :
                            cls.status === 'live' ? 'error' :
                            cls.status === 'cancelled' ? 'default' :
                            'primary'
                          }
                          variant="outlined"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        {cls.teams_meeting_url && cls.status !== 'completed' && cls.status !== 'cancelled' && (
                          <Button
                            variant="contained"
                            size="small"
                            href={cls.teams_meeting_url}
                            target="_blank"
                            sx={{ textTransform: 'none', minHeight: 36 }}
                          >
                            Join
                          </Button>
                        )}
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Box>
            ))}
        </Box>
      )}
    </Box>
  );
}
