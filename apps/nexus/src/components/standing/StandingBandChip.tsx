'use client';

import { Box, Typography, alpha } from '@neram/ui';
import { BAND_COLOR, type ClassStandingBand } from '@/lib/class-standing';

/**
 * The band pill.
 *
 * Carries the LABEL as well as the colour, never colour alone: the same rule
 * the students list follows for its email-domain flag. A red dot means nothing
 * to someone who cannot distinguish it from the amber one.
 */
export default function StandingBandChip({
  band,
  label,
  size = 'medium',
}: {
  band: ClassStandingBand;
  label: string;
  size?: 'small' | 'medium';
}) {
  const color = BAND_COLOR[band];
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: size === 'small' ? 1 : 1.25,
        height: size === 'small' ? 24 : 30,
        borderRadius: 999,
        bgcolor: alpha(color, 0.14),
        flexShrink: 0,
      }}
    >
      <Box
        aria-hidden
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }}
      />
      <Typography
        component="span"
        sx={{
          fontSize: size === 'small' ? '0.72rem' : '0.8125rem',
          fontWeight: 800,
          color,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
