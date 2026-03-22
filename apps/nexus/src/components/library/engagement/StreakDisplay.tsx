'use client';

import { Box, Typography, Paper, useTheme } from '@neram/ui';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';

interface StreakDisplayProps {
  currentStreak: number;
  bestStreak: number;
  totalDays: number;
}

export default function StreakDisplay({ currentStreak, bestStreak, totalDays }: StreakDisplayProps) {
  const theme = useTheme();
  const isActive = currentStreak > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box sx={{ textAlign: 'center', minWidth: 80 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
          {isActive && (
            <LocalFireDepartmentIcon
              sx={{ fontSize: '1.5rem', color: '#ff9800' }}
            />
          )}
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              fontSize: '2rem',
              lineHeight: 1,
              color: isActive ? '#ff9800' : 'text.disabled',
            }}
          >
            {currentStreak}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.7rem' }}>
          day streak
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flex: 1 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {bestStreak}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
            Best Streak
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {totalDays}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
            Active Days
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
