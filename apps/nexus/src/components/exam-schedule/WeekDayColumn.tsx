'use client';

import { Box, Typography, Paper, alpha, useTheme } from '@neram/ui';
import type { DayData } from '@/types/exam-schedule';
import CitySection from './CitySection';
import EmptyDayState from './EmptyDayState';

interface WeekDayColumnProps {
  day: DayData | null;
  currentUserId: string;
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return dateStr === `${y}-${m}-${d}`;
}

export default function WeekDayColumn({ day, currentUserId }: WeekDayColumnProps) {
  const theme = useTheme();

  if (!day) return null;

  const today = isToday(day.date);
  const cities = Object.entries(day.students_by_city);

  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        borderColor: today ? theme.palette.primary.main : undefined,
      }}
    >
      {/* Day header */}
      <Box
        sx={{
          px: 2,
          py: 1.25,
          bgcolor: today
            ? 'primary.main'
            : day.is_past
              ? alpha(theme.palette.text.primary, 0.04)
              : alpha(theme.palette.primary.main, 0.04),
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography
            variant="body2"
            fontWeight={700}
            color={today ? 'primary.contrastText' : 'text.primary'}
          >
            {day.day_name}
          </Typography>
          <Typography
            variant="caption"
            color={today ? 'primary.contrastText' : 'text.secondary'}
            sx={{ opacity: today ? 0.85 : 1 }}
          >
            {formatDayHeader(day.date)}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          fontWeight={600}
          color={today ? 'primary.contrastText' : 'text.secondary'}
        >
          {day.total_students} student{day.total_students !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ p: 1.5 }}>
        {cities.length > 0 ? (
          cities.map(([city, students]) => (
            <CitySection
              key={city}
              city={city}
              students={students}
              currentUserId={currentUserId}
            />
          ))
        ) : (
          <EmptyDayState isPast={day.is_past} />
        )}
      </Box>
    </Paper>
  );
}
