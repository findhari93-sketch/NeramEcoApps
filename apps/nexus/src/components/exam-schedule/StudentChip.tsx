'use client';

import { Box, Typography, Chip, Avatar, alpha, useTheme } from '@neram/ui';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import type { StudentOnDate } from '@/types/exam-schedule';

interface StudentChipProps {
  student: StudentOnDate;
  isMe: boolean;
}

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || '?').toUpperCase();
}

// Deterministic color from name
function getAvatarColor(name: string): string {
  const colors = ['#6C63FF', '#FF6584', '#43AA8B', '#F9C74F', '#4CC9F0', '#F77F00', '#9B5DE5', '#00BBF9'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function StudentChip({ student, isMe }: StudentChipProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 1.5,
        minHeight: 44,
        bgcolor: isMe ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
        border: isMe
          ? `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
          : '1px solid transparent',
        '&:hover': {
          bgcolor: isMe
            ? alpha(theme.palette.primary.main, 0.12)
            : alpha(theme.palette.action.hover, 0.04),
        },
      }}
    >
      <Avatar
        sx={{
          width: 28,
          height: 28,
          fontSize: '0.7rem',
          fontWeight: 700,
          bgcolor: getAvatarColor(student.name),
        }}
      >
        {getInitials(student.name)}
      </Avatar>

      <Typography
        variant="body2"
        fontWeight={isMe ? 600 : 400}
        color={isMe ? 'primary.main' : 'text.primary'}
        noWrap
        sx={{ flex: 1, minWidth: 0, fontSize: '0.85rem' }}
      >
        {student.name}{isMe ? ' (You)' : ''}
      </Typography>

      {student.session && (
        <Chip
          icon={student.session === 'morning'
            ? <WbSunnyOutlinedIcon sx={{ fontSize: '0.8rem' }} />
            : <WbTwilightOutlinedIcon sx={{ fontSize: '0.8rem' }} />
          }
          label={student.session === 'morning' ? 'AM' : 'PM'}
          size="small"
          variant="outlined"
          sx={{
            height: 22,
            fontSize: '0.65rem',
            fontWeight: 600,
            '& .MuiChip-icon': { ml: 0.5 },
          }}
        />
      )}

      {student.attempt_number > 1 && (
        <Chip
          label={`${student.attempt_number}nd`}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600, minWidth: 28 }}
        />
      )}
    </Box>
  );
}
