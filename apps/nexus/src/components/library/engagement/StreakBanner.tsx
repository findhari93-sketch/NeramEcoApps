'use client';

import { Box, Typography, Paper } from '@neram/ui';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';

interface StreakBannerProps {
  currentStreak: number;
  bestStreak: number;
}

export default function StreakBanner({ currentStreak, bestStreak }: StreakBannerProps) {
  const isActive = currentStreak > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2.5,
        background: isActive
          ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)'
          : 'linear-gradient(135deg, #9e9e9e 0%, #757575 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocalFireDepartmentIcon sx={{ fontSize: '2.5rem' }} />
        <Box>
          <Typography
            variant="h3"
            sx={{ fontWeight: 800, fontSize: { xs: '2rem', sm: '2.5rem' }, lineHeight: 1 }}
          >
            {currentStreak}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, opacity: 0.9 }}>
            day streak
          </Typography>
        </Box>
      </Box>
      <Box sx={{ ml: 'auto', textAlign: 'right' }}>
        <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
          Best streak
        </Typography>
        <Typography variant="body1" sx={{ fontWeight: 700 }}>
          {bestStreak} days
        </Typography>
      </Box>
    </Paper>
  );
}
