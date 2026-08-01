'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';

/**
 * A full-width labelled progress bar for the profile page.
 *
 * Deliberately NOT the `Meter` in ../StudentStatMeters.tsx: that one is sized
 * for the dense student list (`flex: 0 1 130px`) and shows only a percentage.
 * This one spans the section, carries the underlying count, and accepts a null
 * value. Widening the shared Meter would have changed every row of the list.
 *
 * `value: null` means NOT MEASURED and renders `emptyNote` instead of a bar.
 * There is no way to draw 0% for something we never measured, which is the
 * whole point: see the attendance rule in lib/parent-attendance.ts.
 */
export default function ProgressRow({
  label,
  value,
  caption,
  emptyNote,
  goodAt = 75,
}: {
  label: string;
  /** 0 to 100, or null when the thing was never measured. */
  value: number | null;
  /** The underlying count, e.g. "12 of 15 classes". */
  caption?: string | null;
  /** Rendered in place of the bar when value is null. */
  emptyNote?: string | null;
  /** At or above this the bar reads as healthy. */
  goodAt?: number;
}) {
  const theme = useTheme();

  if (value === null) {
    return (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {emptyNote || 'Not measured for this period.'}
        </Typography>
      </Box>
    );
  }

  const color =
    value >= goodAt
      ? theme.palette.success.main
      : value >= goodAt * 0.6
        ? theme.palette.warning.main
        : theme.palette.error.main;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 1,
          mb: 0.5,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexShrink: 0 }}>
          {caption && (
            <Typography variant="caption" color="text.secondary">
              {caption}
            </Typography>
          )}
          <Typography variant="body2" sx={{ fontWeight: 700, color }}>
            {Math.round(value)}%
          </Typography>
        </Box>
      </Box>
      <Box
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        sx={{ height: 8, borderRadius: 4, bgcolor: alpha(color, 0.16), overflow: 'hidden' }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, value))}%`,
            bgcolor: color,
            borderRadius: 4,
            transition: 'width .3s ease',
          }}
        />
      </Box>
    </Box>
  );
}
