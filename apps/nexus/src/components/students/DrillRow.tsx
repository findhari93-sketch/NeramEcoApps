'use client';

import { Box, Typography, Paper, alpha, useTheme } from '@neram/ui';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

interface DrillRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  count: number;
  countLabel?: string; // e.g. "students"
  onClick: () => void;
}

/**
 * A full-width tappable row used for the Country and State levels of the
 * City-Wise drill-down: icon + title/subtitle on the left, the count and a
 * chevron on the right. Mirrors CityCard's visual language for consistency.
 */
export default function DrillRow({ icon, title, subtitle, count, countLabel = 'students', onClick }: DrillRowProps) {
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 2,
        cursor: 'pointer',
        borderRadius: 2,
        minHeight: 56,
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: alpha(theme.palette.primary.main, 0.04),
          borderColor: theme.palette.primary.main,
          transform: 'translateY(-1px)',
          boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.12)}`,
        },
        '&:active': { transform: 'translateY(0)' },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
        }}
      >
        {icon}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {subtitle}
          </Typography>
        )}
      </Box>

      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', lineHeight: 1 }}>
          {count}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {count === 1 ? countLabel.replace(/s$/, '') : countLabel}
        </Typography>
      </Box>

      <ArrowForwardIosIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
    </Paper>
  );
}
