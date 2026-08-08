'use client';

/**
 * Where a cohort stands, rather than what happened lately.
 *
 * This tab used to be "Caught up" and was a single feed of finished items over
 * the last sixty days. The label and the contents disagreed in a way that
 * misled people every time: "Caught up (7)" was read as seven finished students
 * when it meant seven cleared classes, so one student who had cleared two of her
 * five appeared twice and looked done. Meanwhile the students who genuinely owed
 * nothing were not on this screen at all, because the route dropped them.
 *
 * So there are two sections now, and they answer two different questions.
 * "All clear" is a state: who owes nothing at this moment, which is the list
 * worth reading out. "Recently finished" is the original event feed: what
 * cleared this week and how long each one took.
 */
import { useMemo } from 'react';
import { Box, Typography } from '@neram/ui';
import AllClearWall from './AllClearWall';
import CaughtUpTab from './CaughtUpTab';
import { SECTION_HEADING_SX } from './shared';
import type { TabProps } from './types';

export default function StandingTab(props: TabProps) {
  const { data, busy, onCelebrate } = props;

  const allClear = useMemo(
    () => data.students.filter((s) => s.bucket === 'all_clear'),
    [data.students],
  );

  return (
    <Box>
      <AllClearWall
        students={allClear}
        busy={busy === 'celebrate'}
        onShare={onCelebrate ? (rows) => onCelebrate(rows) : undefined}
      />

      <Typography sx={SECTION_HEADING_SX}>Recently finished</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Every class cleared in the last 60 days, newest first, with how long it took.
      </Typography>
      <CaughtUpTab {...props} />
    </Box>
  );
}
