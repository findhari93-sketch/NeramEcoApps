'use client';

/**
 * Three headline numbers for the performance dashboard. Values only, no
 * chart, so this is the one place in the feature dataviz's interaction layer
 * deliberately does not apply (a bare stat tile skips the hover layer by
 * design, per the dataviz skill's own exception).
 */

import { Box, Paper, Typography } from '@neram/ui';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, borderRadius: 2, textAlign: 'center' }}>
      <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
        {label}
      </Typography>
    </Paper>
  );
}

export default function PerformanceStatTiles({
  totalAttempts,
  overallAveragePct,
  attemptsThisMonth,
}: {
  totalAttempts: number;
  overallAveragePct: number | null;
  attemptsThisMonth: number;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 1.5 }, mb: 3 }}>
      <Tile label="Tests attempted" value={String(totalAttempts)} />
      <Tile label="Overall average" value={overallAveragePct == null ? '–' : `${overallAveragePct}%`} />
      <Tile label="This month" value={String(attemptsThisMonth)} />
    </Box>
  );
}
