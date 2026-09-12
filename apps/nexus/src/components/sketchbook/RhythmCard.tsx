'use client';

import { Paper, Skeleton, Typography } from '@neram/ui';
import RhythmDots from './RhythmDots';
import { rhythmLine, type Rhythm } from '@/lib/sketchbook-rhythm';

interface RhythmCardProps {
  rhythm: Rhythm | null;
  loading?: boolean;
  /** 0..6 for the current week's today. Computed by the caller from the IST date. */
  todayIndex?: number;
}

export default function RhythmCard({ rhythm, loading = false, todayIndex }: RhythmCardProps) {
  if (loading || !rhythm) {
    return <Skeleton variant="rounded" height={124} sx={{ borderRadius: 2, mb: 2 }} />;
  }
  const detail =
    rhythm.totalDays === 0
      ? 'Small sketches count. A ten-minute study is a practice day.'
      : `Best run ${rhythm.bestRun} ${rhythm.bestRun === 1 ? 'week' : 'weeks'}. ${rhythm.totalDays} practice days in all.`;
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Typography variant="overline" color="text.secondary">This week</Typography>
      <RhythmDots days={rhythm.week.days} todayIndex={todayIndex} />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>{rhythmLine(rhythm)}</Typography>
      <Typography variant="body2" color="text.secondary">{detail}</Typography>
    </Paper>
  );
}
