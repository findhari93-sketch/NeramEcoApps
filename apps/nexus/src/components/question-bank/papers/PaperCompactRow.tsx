'use client';

import { Box, Typography } from '@neram/ui';
import PaperProgressBar from '../PaperProgressBar';
import PaperRowShell from './PaperRowShell';
import PaperIdentity from './PaperIdentity';
import PaperActions, { PaperBlockedReason, PaperStatusChip } from './PaperActions';
import type { PaperStats } from './derivePaperStats';
import type { PaperActionHandlers, PaperWithBreakdown } from './paperTypes';

export interface PaperCompactRowProps {
  paper: PaperWithBreakdown;
  stats: PaperStats;
  actions: PaperActionHandlers;
}

/**
 * What the table becomes below md.
 *
 * A table does not shrink: eight columns at 375px is either a horizontal scroll
 * across the whole page or unreadable 9px text. So the phone gets the same
 * information stacked, at the same density the table was chosen for, with the
 * actions as icons rather than a wrapped row of four labelled buttons.
 */
export default function PaperCompactRow({ paper, stats, actions }: PaperCompactRowProps) {
  return (
    <PaperRowShell
      onOpen={() => actions.onOpen(paper.id)}
      label={stats.paperLabel}
      dimmed={actions.actionLoading === `${paper.id}-delete`}
      sx={{ p: 1.5, minHeight: 64 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <PaperIdentity paper={paper} stats={stats} showHindi={false} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
            <Box sx={{ flex: '1 1 auto', minWidth: 64, maxWidth: 160 }}>
              <PaperProgressBar
                total={stats.total}
                draft={stats.draft}
                answerKeyed={stats.answerKeyedOnly}
                complete={Math.max(0, stats.complete - stats.activeCount)}
                active={stats.activeCount}
              />
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}
            >
              {stats.total} Qs &middot; {stats.activeCount} active
            </Typography>
          </Box>

          <Box sx={{ mt: 0.75 }}>
            <PaperStatusChip visible={paper.is_student_visible} />
          </Box>
          <PaperBlockedReason paper={paper} stats={stats} compact />
        </Box>

        {/* Icons, not buttons. Four labelled buttons at this width wrap onto
            three lines and undo the density the compact view exists for. */}
        <Box sx={{ flexShrink: 0 }}>
          <PaperActions paper={paper} stats={stats} actions={actions} variant="icons" />
        </Box>
      </Box>
    </PaperRowShell>
  );
}
