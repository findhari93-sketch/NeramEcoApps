'use client';

import { Box, Typography } from '@neram/ui';
import PaperProgressBar from '../PaperProgressBar';
import PaperRowShell from './PaperRowShell';
import PaperIdentity from './PaperIdentity';
import SectionBreakdown from './SectionBreakdown';
import PaperActions, { PaperBlockedReason, PaperStatusChip } from './PaperActions';
import type { PaperStats } from './derivePaperStats';
import type { PaperActionHandlers, PaperWithBreakdown } from './paperTypes';

export interface PaperDetailedCardProps {
  paper: PaperWithBreakdown;
  stats: PaperStats;
  actions: PaperActionHandlers;
  getCategoryLabel: (cat: string) => string;
  formatDate: (dateStr: string) => string;
}

/**
 * The roomy view: everything about one paper, laid out to be acted on rather
 * than compared.
 *
 * Unchanged in substance from the card this page used to be built entirely
 * from. What changed is that it is now one of three, so its identity chips,
 * status chip, actions and blocked-reason line come from the shared pieces
 * instead of being written out here.
 */
export default function PaperDetailedCard({
  paper,
  stats,
  actions,
  getCategoryLabel,
  formatDate,
}: PaperDetailedCardProps) {
  return (
    <PaperRowShell
      onOpen={() => actions.onOpen(paper.id)}
      label={stats.paperLabel}
      dimmed={actions.actionLoading === `${paper.id}-delete`}
      sx={{ p: 2 }}
    >
      {/* Header row. It wraps: on a phone the identity chips take the first
          line and the status travels with its date to the second, rather than
          the date breaking a word per line. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <PaperIdentity paper={paper} stats={stats} />
        <Box sx={{ flex: '1 1 0', minWidth: 0 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          {/* The state teachers kept missing: parsing progress and question
              activation both look like "done" without it. */}
          <PaperStatusChip visible={paper.is_student_visible} />
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {formatDate(paper.created_at)}
          </Typography>
        </Box>
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
        sx={{ mb: 0.75, display: 'block', fontSize: { xs: '0.8125rem', sm: '0.75rem' } }}
      >
        {stats.total} total &middot; {stats.keyed} with answers &middot; {stats.complete} complete
        {stats.activeCount > 0 ? ` · ${stats.activeCount} active` : ''}
        {stats.hasPdf ? ' · PDF linked' : ''}
      </Typography>

      <Box sx={{ mb: 0.75 }}>
        <PaperBlockedReason paper={paper} stats={stats} />
      </Box>

      {paper.section_breakdown && Object.keys(paper.section_breakdown).length > 0 && (
        <Box sx={{ mb: 1 }}>
          <SectionBreakdown
            breakdown={paper.section_breakdown}
            getCategoryLabel={getCategoryLabel}
          />
        </Box>
      )}

      <Box sx={{ mt: 1.5 }}>
        <PaperActions paper={paper} stats={stats} actions={actions} />
      </Box>
    </PaperRowShell>
  );
}
