'use client';

import { Box, LinearProgress, Paper, Skeleton, Typography } from '@neram/ui';
import { percentOf } from '@/lib/tag-coverage-view';

interface Props {
  total: number | null;
  tagged: number | null;
  loading: boolean;
}

/**
 * How much of the bank a topic filter can actually find.
 *
 * "Tagged" is a subject or theme tag. The bar is the one number this screen
 * exists to move, so it sits at the top and updates as questions are accepted.
 */
export default function CoverageMeter({ total, tagged, loading }: Props) {
  if (loading || total == null || tagged == null) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} aria-busy="true" aria-label="Loading tag coverage">
        <Skeleton variant="text" width="70%" height={28} />
        <Skeleton variant="rounded" height={8} sx={{ my: 1.25 }} />
        <Skeleton variant="text" width="50%" />
      </Paper>
    );
  }

  const pct = percentOf(tagged, total);
  const untagged = Math.max(0, total - tagged);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle1" component="p" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
        {pct}% of the bank is tagged
        <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
          {' '}
          · {tagged.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}
        </Box>
      </Typography>
      <LinearProgress
        variant="determinate"
        value={pct}
        aria-label={`${pct}% of questions carry a topic tag`}
        sx={{ my: 1.25, height: 8, borderRadius: 4 }}
      />
      <Typography variant="body2" color="text.secondary">
        {untagged === 0
          ? 'Every question has a topic. Topic filters in the test builder can find all of them.'
          : `${untagged.toLocaleString('en-IN')} questions have no topic yet, so a topic filter in the test builder cannot find them.`}
      </Typography>
    </Paper>
  );
}
