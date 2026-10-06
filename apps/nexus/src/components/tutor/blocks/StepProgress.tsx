'use client';

import { Box, LinearProgress, Typography } from '@neram/ui';

/** "Step 2 of 4" over a thin bar. The words carry it; the bar is a glance. */
export default function StepProgress({ index, total }: { index: number; total: number }) {
  const safeTotal = Math.max(1, total);
  const value = Math.min(100, Math.round((index / safeTotal) * 100));
  const label = `Step ${index} of ${total}`;
  return (
    <Box>
      <Typography variant="overline" component="p" sx={{ fontWeight: 700, lineHeight: 1.6, color: 'text.secondary' }}>
        {label}
      </Typography>
      <LinearProgress variant="determinate" value={value} aria-label={label} sx={{ height: 6, borderRadius: 3 }} />
    </Box>
  );
}
