'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Tabs,
  Tab,
} from '@neram/ui';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ScheduledClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: { title: string; category: string } | null;
  teacher: { name: string } | null;
}

export default function ParentTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);

  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  useEffect(() => {
    if (!activeClassroom) return;
    fetchClasses();
  }, [activeClassroom, selectedDay]);

  async function fetchClasses() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const date = weekDays[selectedDay].toISOString().split('T')[0];
      const res = await fetch(
        `/api/timetable?classroom=${activeClassroom!.id}&date=${date}`,
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

  const formatTime = (t: string) =>
    new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

  const statusColor = (s: string) => {
    if (s === 'completed') return 'success';
    if (s === 'in_progress') return 'info';
    if (s === 'cancelled') return 'error';
    return 'default';
  };

  return (
    <Box>
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Class Timetable
      </Typography>

      <Tabs
        value={selectedDay}
        onChange={(_, v) => setSelectedDay(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5 } }}
      >
        {weekDays.map((d, i) => (
          <Tab key={i} label={dayLabel(d)} />
        ))}
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : classes.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <EventOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No classes scheduled for this day.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {classes.map((cls) => (
            <Paper key={cls.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }} noWrap>
                  {cls.title}
                </Typography>
                <Chip
                  label={cls.status}
                  size="small"
                  color={statusColor(cls.status) as any}
                  sx={{ textTransform: 'capitalize' }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                {cls.teacher && ` · ${cls.teacher.name}`}
              </Typography>
              {cls.topic && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {cls.topic.title}
                </Typography>
              )}
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
