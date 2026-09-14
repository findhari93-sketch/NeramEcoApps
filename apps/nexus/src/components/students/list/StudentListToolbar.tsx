'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import PeopleSearchField from '@/components/PeopleSearchField';
import { pausedFootnote } from '@/lib/student-list-view';
import ListSortMenu from './ListSortMenu';
import StageFilter from './StageFilter';
import type { StudentListView } from './useStudentListView';

/**
 * Search, sort and the stage filter for a list of students, in one row on a
 * laptop and two on a phone (search on its own line, controls below it).
 *
 * Render it above `view.shown` from useStudentListView. Put status cards above
 * it with `statusSlot` and screen actions (export, select) with `actionsSlot`.
 */
export default function StudentListToolbar<T, S extends string, F extends string>({
  view,
  searchLabel = 'Find a student',
  statusSlot,
  actionsSlot,
  sticky = false,
}: {
  view: StudentListView<T, S, F>;
  searchLabel?: string;
  statusSlot?: ReactNode;
  actionsSlot?: ReactNode;
  /** Keep search and filters in reach while a long list scrolls. */
  sticky?: boolean;
}) {
  return (
    <Box
      sx={{
        mb: 1.5,
        ...(sticky ? { position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.default', pt: 1 } : {}),
      }}
    >
      {statusSlot}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <PeopleSearchField
          value={view.query}
          onChange={view.setQuery}
          label={searchLabel}
          placeholder="Search by name"
          resultCount={view.shown.length}
          sx={{ flex: { xs: '1 1 100%', sm: '1 1 240px' }, minWidth: 0 }}
        />
        <ListSortMenu value={view.sort} options={view.sortOptions} onChange={view.setSort} />
        <StageFilter
          value={view.stages}
          counts={view.stageCounts}
          onToggle={view.toggleStage}
          onClear={view.clearStages}
          disabled={!view.stageReady}
        />
        {actionsSlot && <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>{actionsSlot}</Box>}
      </Box>
    </Box>
  );
}

/** The quiet line under a list that explains why its count may differ from another screen's. */
export function PausedFootnote({ count }: { count: number }) {
  const text = pausedFootnote(count);
  if (!text) return null;
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: 'center' }} data-testid="paused-footnote">
      {text}
    </Typography>
  );
}
