'use client';

import { Box, Typography, Chip, alpha, useTheme } from '@neram/ui';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import type { ExamScheduleStudent } from '@/types/exam-schedule';

interface CityStudentGroupProps {
  city: string;
  students: ExamScheduleStudent[];
  currentUserId: string;
}

export default function CityStudentGroup({ city, students, currentUserId }: CityStudentGroupProps) {
  const theme = useTheme();

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="body2" fontWeight={700} noWrap>
          {city}
        </Typography>
        <Chip
          label={students.length}
          size="small"
          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
        />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {students.map((student) => {
          const isMe = student.student_id === currentUserId;
          return (
            <Box
              key={student.student_id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                bgcolor: isMe ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                border: isMe ? `1px solid ${alpha(theme.palette.primary.main, 0.2)}` : '1px solid transparent',
              }}
            >
              <Typography
                variant="body2"
                fontWeight={isMe ? 600 : 400}
                color={isMe ? 'primary.main' : 'text.primary'}
                noWrap
                sx={{ flex: 1, minWidth: 0 }}
              >
                {student.name}{isMe ? ' (You)' : ''}
              </Typography>
              {student.session && (
                <Chip
                  icon={student.session === 'morning'
                    ? <WbSunnyOutlinedIcon sx={{ fontSize: '0.85rem' }} />
                    : <WbTwilightOutlinedIcon sx={{ fontSize: '0.85rem' }} />
                  }
                  label={student.session === 'morning' ? 'AM' : 'PM'}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
