'use client';

import { Box, Typography, Chip } from '@neram/ui';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import type { StudentOnDate } from '@/types/exam-schedule';
import StudentChip from './StudentChip';

interface CitySectionProps {
  city: string;
  students: StudentOnDate[];
  currentUserId: string;
}

export default function CitySection({ city, students, currentUserId }: CitySectionProps) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, px: 0.5 }}>
        <LocationOnOutlinedIcon sx={{ fontSize: '0.95rem', color: 'text.secondary' }} />
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {city}
        </Typography>
        <Chip label={students.length} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {students.map((s) => (
          <StudentChip key={s.student_id} student={s} isMe={s.student_id === currentUserId} />
        ))}
      </Box>
    </Box>
  );
}
