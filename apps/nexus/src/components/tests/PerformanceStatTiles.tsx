'use client';

/**
 * Three headline numbers for the performance dashboard.
 *
 * Values only, no chart, so this is the one place in the feature where the
 * dataviz interaction layer deliberately does not apply (a bare stat tile skips
 * the hover layer by design).
 *
 * Flat baseline, like every other card on this screen: no elevation, a 1px
 * divider border, and no shadow. These are read, not pressed, so they must not
 * look pressable.
 */

import { Box, Paper, Typography } from '@neram/ui';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.25, sm: 2 },
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        textAlign: 'center',
      }}
    >
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
    <Box
      component="dl"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: { xs: 1, sm: 1.5 },
        mb: 3,
        m: 0,
      }}
    >
      <Tile label="Tests attempted" value={String(totalAttempts)} />
      {/* "Not yet" rather than a dash: a student reading a dash cannot tell
          whether it means zero, an error, or a number still being worked out. */}
      <Tile label="Overall average" value={overallAveragePct == null ? 'Not yet' : `${overallAveragePct}%`} />
      <Tile label="This month" value={String(attemptsThisMonth)} />
    </Box>
  );
}
