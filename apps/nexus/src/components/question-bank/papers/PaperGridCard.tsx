'use client';

import { Box, Typography } from '@neram/ui';
import PaperProgressBar from '../PaperProgressBar';
import PaperRowShell from './PaperRowShell';
import PaperIdentity from './PaperIdentity';
import PaperActions, { PaperBlockedReason, PaperStatusChip } from './PaperActions';
import type { PaperStats } from './derivePaperStats';
import type { PaperActionHandlers, PaperWithBreakdown } from './paperTypes';

export interface PaperGridCardProps {
  paper: PaperWithBreakdown;
  stats: PaperStats;
  actions: PaperActionHandlers;
  formatDate: (dateStr: string) => string;
}

/**
 * The middle density: three papers per row on a desktop, one on a phone.
 *
 * Drops the section chips entirely. A tile that has to stay the same height as
 * its neighbours cannot also carry a variable wall of twenty tags, and the
 * breakdown is a per-paper detail rather than something you compare across
 * papers. It is one click away in the detailed view and on the paper itself.
 *
 * The card body grows and the actions are pinned to the bottom with `mt:auto`,
 * so the buttons line up across a row even when one paper has a longer identity
 * line than the next.
 */
export default function PaperGridCard({
  paper,
  stats,
  actions,
  formatDate,
}: PaperGridCardProps) {
  return (
    <PaperRowShell
      onOpen={() => actions.onOpen(paper.id)}
      label={stats.paperLabel}
      dimmed={actions.actionLoading === `${paper.id}-delete`}
      sx={{ p: 1.5, display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <Box sx={{ mb: 1 }}>
        <PaperIdentity paper={paper} stats={stats} showHindi={false} />
      </Box>

      <Box sx={{ mb: 1 }}>
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
        sx={{ display: 'block', fontSize: { xs: '0.8125rem', sm: '0.75rem' } }}
      >
        {stats.total} questions &middot; {stats.keyed} with answers
        {stats.activeCount > 0 ? ` · ${stats.activeCount} active` : ''}
      </Typography>

      <Box sx={{ mt: 0.5, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <PaperStatusChip visible={paper.is_student_visible} short />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {formatDate(paper.created_at)}
        </Typography>
      </Box>

      <PaperBlockedReason paper={paper} stats={stats} compact />

      <Box sx={{ mt: 'auto', pt: 1 }}>
        <PaperActions paper={paper} stats={stats} actions={actions} />
      </Box>
    </PaperRowShell>
  );
}
