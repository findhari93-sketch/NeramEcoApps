'use client';

import { Box, Typography } from '@neram/ui';
import { neramFontFamilies } from '@neram/ui';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

interface RankChangeIndicatorProps {
  change: number;
}

export default function RankChangeIndicator({ change }: RankChangeIndicatorProps) {
  if (change === 0) return null;

  const isPositive = change > 0;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
      }}
    >
      {isPositive ? (
        <ArrowUpwardIcon sx={{ fontSize: 16, color: '#22c55e' }} />
      ) : (
        <ArrowDownwardIcon sx={{ fontSize: 16, color: '#ef4444' }} />
      )}
      <Typography
        component="span"
        sx={{
          fontFamily: neramFontFamilies.body,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: isPositive ? '#22c55e' : '#ef4444',
          lineHeight: 1,
        }}
      >
        {Math.abs(change)}
      </Typography>
    </Box>
  );
}
