'use client';

/**
 * The performance dashboard: stat tiles, the score trend, and every attempt
 * behind it. Purely presentational, data and its lazy fetch belong to the
 * page shell, gated on `tab === 'performance' && data === null`, exactly the
 * pattern the teacher tests hub already uses for its "By location" tab. That
 * keeps the fetch firing once per visit, not once per tab switch.
 */

import { useState } from 'react';
import { Box, Typography, Skeleton, Alert } from '@neram/ui';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import TestsSection from './TestsSection';
import PerformanceStatTiles from './PerformanceStatTiles';
import PerformanceTrendChart from './PerformanceTrendChart';
import PerformanceMonthlyList, { type PerformanceAttemptRow } from './PerformanceMonthlyList';
import StudentAttemptSheet from './StudentAttemptSheet';
import type { NexusStudentPerformanceSummary } from '@neram/database';

export interface PerformanceTabData {
  summary: NexusStudentPerformanceSummary;
  attempts: PerformanceAttemptRow[];
}

export default function PerformanceTab({
  data,
  error,
  getToken,
  me,
}: {
  data: PerformanceTabData | null;
  error: string | null;
  /** Present enables the response sheet. Omitted leaves the list read-only. */
  getToken?: () => Promise<string | null>;
  me?: { id: string; name: string | null; avatar_url: string | null } | null;
}) {
  // Which test's history is open. Keyed on the test rather than the attempt,
  // because the sheet shows every sitting of that paper anyway.
  const [openRow, setOpenRow] = useState<PerformanceAttemptRow | null>(null);
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
          Your scores will appear here once you have sat your first test.
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
      <TestsSection icon={<ShowChartOutlinedIcon />} title="Score trend">
        <PerformanceTrendChart monthly={data.summary.monthly} />
      </TestsSection>

      <TestsSection
        icon={<CalendarMonthOutlinedIcon />}
        title="By month"
        subtitle={getToken ? 'Tap any attempt to see your answers.' : undefined}
      >
        <PerformanceMonthlyList
          attempts={data.attempts}
          onOpen={getToken ? (row) => setOpenRow(row) : undefined}
        />
      </TestsSection>

      {getToken && (
        <StudentAttemptSheet
          open={openRow != null}
          endpoint={openRow ? `/api/student/tests/${openRow.test_id}/attempts` : ''}
          subtitle={openRow ? `${openRow.test_title}, your attempts` : undefined}
          student={me ?? { id: '', name: 'You', avatar_url: null }}
          getToken={getToken}
          onClose={() => setOpenRow(null)}
          onPrev={() => {}}
          onNext={() => {}}
          hasPrev={false}
          hasNext={false}
        />
      )}
    </Box>
  );
}
