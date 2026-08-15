'use client';

/**
 * The performance dashboard: stat tiles, the score trend, and every attempt
 * behind it. Purely presentational, data and its lazy fetch belong to the
 * page shell, gated on `tab === 'performance' && data === null`, exactly the
 * pattern the teacher tests hub already uses for its "By location" tab. That
 * keeps the fetch firing once per visit, not once per tab switch.
 */

import { Box, Typography, Skeleton, Alert } from '@neram/ui';
import PerformanceStatTiles from './PerformanceStatTiles';
import PerformanceTrendChart from './PerformanceTrendChart';
import PerformanceMonthlyList, { type PerformanceAttemptRow } from './PerformanceMonthlyList';
import type { NexusStudentPerformanceSummary } from '@neram/database';

export interface PerformanceTabData {
  summary: NexusStudentPerformanceSummary;
  attempts: PerformanceAttemptRow[];
}

export default function PerformanceTab({ data, error }: { data: PerformanceTabData | null; error: string | null }) {
  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {error}
      </Alert>
    );
  }

  if (data === null) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (data.summary.total_attempts === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Attempt a test to start building your performance record.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <PerformanceStatTiles
        totalAttempts={data.summary.total_attempts}
        overallAveragePct={data.summary.overall_average_pct}
        attemptsThisMonth={data.summary.attempts_this_month}
      />
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Score trend
        </Typography>
        <PerformanceTrendChart monthly={data.summary.monthly} />
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        By month
      </Typography>
      <PerformanceMonthlyList attempts={data.attempts} />
    </Box>
  );
}
