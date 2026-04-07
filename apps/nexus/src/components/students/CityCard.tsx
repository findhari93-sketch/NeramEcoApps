'use client';

import { Box, Typography, Paper, alpha, useTheme } from '@neram/ui';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

interface CityCardProps {
  city: string;
  studentCount: number;
  totalStudents: number;
  state?: string | null;
  onClick: () => void;
}

export default function CityCard({ city, studentCount, totalStudents, state, onClick }: CityCardProps) {
  const theme = useTheme();
  const percentage = totalStudents > 0 ? Math.round((studentCount / totalStudents) * 100) : 0;

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 2,
        cursor: 'pointer',
        borderRadius: 2,
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 48,
        '&:hover': {
          backgroundColor: alpha(theme.palette.primary.main, 0.04),
          borderColor: theme.palette.primary.main,
          transform: 'translateY(-1px)',
          boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.12)}`,
        },
        '&:active': {
          transform: 'translateY(0)',
        },
      }}
    >
      {/* Percentage bar at bottom */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 3,
          width: `${percentage}%`,
          backgroundColor: alpha(theme.palette.primary.main, 0.3),
          borderRadius: '0 2px 0 0',
        }}
      />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <LocationCityOutlinedIcon sx={{ fontSize: 20, color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
              {city}
            </Typography>
          </Box>
          {state && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 3.5 }}>
              {state}
            </Typography>
          )}
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', lineHeight: 1 }}>
            {studentCount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {studentCount === 1 ? 'student' : 'students'}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="caption" color="text.disabled">
          {percentage}% of total
        </Typography>
        <ArrowForwardIosIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
      </Box>
    </Paper>
  );
}
