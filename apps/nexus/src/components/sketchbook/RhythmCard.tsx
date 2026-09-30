'use client';

import { Box, Paper, Skeleton, Typography } from '@neram/ui';
import RhythmDots from './RhythmDots';
import { daysBetween, istDate, lastWeekLine, rhythmLine, weekRangeLabel, type Rhythm } from '@/lib/sketchbook-rhythm';

interface RhythmCardProps {
  rhythm: Rhythm | null;
  loading?: boolean;
}

/**
 * This week on the student's own clock. The ring sits on the server's "today"
 * (rhythm.today), never the viewer's IST, so a student abroad and the teacher
 * peeking at them see the same week. The dates and the last-week line exist
 * because "this week" alone hid a Sunday drawing the moment Monday came (NXS-0129).
 */
export default function RhythmCard({ rhythm, loading = false }: RhythmCardProps) {
  if (loading || !rhythm) {
    return <Skeleton variant="rounded" height={148} sx={{ borderRadius: 2, mb: 2 }} />;
  }
  // A device cache from before rhythm.today existed falls back to IST.
  const index = daysBetween(rhythm.week.start, rhythm.today ?? istDate(new Date()));
  const todayIndex = index >= 0 && index <= 6 ? index : undefined;
  const lastWeek = rhythm.totalDays > 0 ? lastWeekLine(rhythm) : null;
  const detail =
    rhythm.totalDays === 0
      ? 'Small sketches count. A ten-minute study is a practice day.'
      : `Best run ${rhythm.bestRun} ${rhythm.bestRun === 1 ? 'week' : 'weeks'}. ${rhythm.totalDays} practice days in all.`;
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
        <Typography variant="overline" color="text.secondary">This week</Typography>
        <Typography variant="caption" color="text.secondary">{weekRangeLabel(rhythm.week.start)}</Typography>
      </Box>
      <RhythmDots days={rhythm.week.days} todayIndex={todayIndex} />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>{rhythmLine(rhythm)}</Typography>
      {lastWeek && <Typography variant="body2" color="text.secondary">{lastWeek}</Typography>}
      <Typography variant="body2" color="text.secondary">{detail}</Typography>
    </Paper>
  );
}
