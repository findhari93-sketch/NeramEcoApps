'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import WeeklyCalendarGrid, { getWeekDates } from '@/components/timetable/WeeklyCalendarGrid';
import { type ClassCardData } from '@/components/timetable/ClassCard';

export default function ParentTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchClasses = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const week = getWeekDates(weekOffset);
      const res = await fetch(
        `/api/timetable?classroom=${activeClassroom.id}&start=${week.start}&end=${week.end}`,
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
  }, [activeClassroom, weekOffset, getToken]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  return (
    <Box>
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Class Timetable
      </Typography>

      <WeeklyCalendarGrid
        classes={classes}
        loading={loading}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
        role="parent"
      />
    </Box>
  );
}
