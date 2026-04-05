'use client';

import { Box, Typography, Paper, Chip, useTheme } from '@neram/ui';
import type { ExamScheduleUpcomingDate } from '@/types/exam-schedule';
import CityStudentGroup from './CityStudentGroup';

interface ExamDateCardProps {
  data: ExamScheduleUpcomingDate;
  currentUserId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatPhase(phase: string): string {
  return phase.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ExamDateCard({ data, currentUserId }: ExamDateCardProps) {
  const theme = useTheme();
  const cities = Object.entries(data.students_by_city);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderLeft: `3px solid ${theme.palette.primary.main}`,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {formatDate(data.exam_date.exam_date)}
        </Typography>
        <Chip
          label={formatPhase(data.exam_date.phase)}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ height: 22, fontSize: '0.7rem' }}
        />
        {data.exam_date.attempt_number > 1 && (
          <Chip
            label={`Attempt ${data.exam_date.attempt_number}`}
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {data.total_students} student{data.total_students !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* City groups */}
      {cities.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: cities.length >= 3 ? 'repeat(3, 1fr)' : `repeat(${cities.length}, 1fr)`,
              md: cities.length >= 4 ? 'repeat(4, 1fr)' : `repeat(${cities.length}, 1fr)`,
            },
            gap: { xs: 2, sm: 2.5 },
          }}
        >
          {cities.map(([city, students]) => (
            <CityStudentGroup
              key={city}
              city={city}
              students={students}
              currentUserId={currentUserId}
            />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No students registered yet
        </Typography>
      )}
    </Paper>
  );
}
