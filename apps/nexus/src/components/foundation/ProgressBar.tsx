'use client';

import { Box, Typography, LinearProgress, alpha, useTheme } from '@neram/ui';

interface ProgressBarProps {
  completed: number;
  total: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'small' | 'medium';
  color?: string;
}

export default function FoundationProgressBar({
  completed,
  total,
  label,
  showPercentage = true,
  size = 'medium',
  color,
}: ProgressBarProps) {
  const theme = useTheme();
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const barColor = color || theme.palette.primary.main;

  return (
    <Box>
      {(label || showPercentage) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          {label && (
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 500, fontSize: size === 'small' ? '0.65rem' : '0.75rem' }}
            >
              {label}
            </Typography>
          )}
          {showPercentage && (
            <Typography
              variant="caption"
              sx={{ color: barColor, fontWeight: 700, fontSize: size === 'small' ? '0.65rem' : '0.75rem' }}
            >
              {completed}/{total} ({percentage}%)
            </Typography>
          )}
        </Box>
      )}
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: size === 'small' ? 4 : 8,
          borderRadius: 4,
          bgcolor: alpha(barColor, 0.1),
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            bgcolor: barColor,
            transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
          },
        }}
      />
    </Box>
  );
}
