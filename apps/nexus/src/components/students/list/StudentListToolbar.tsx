'use client';

import type { ReactNode } from 'react';
import { Box, Button, Typography } from '@neram/ui';
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
  dense = false,
}: {
  view: StudentListView<T, S, F>;
  searchLabel?: string;
  statusSlot?: ReactNode;
  actionsSlot?: ReactNode;
  /** Keep search and filters in reach while a long list scrolls. */
  sticky?: boolean;
  /**
   * Search shares the phone row with Sort and Stage instead of taking a row of
   * its own. For screens where the list below needs every pixel of height (the
   * attendance register fills the rest of the screen).
   */
  dense?: boolean;
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
          placeholder={dense ? 'Search' : 'Search by name'}
          resultCount={view.shown.length}
          sx={{ flex: { xs: dense ? '1 1 130px' : '1 1 100%', sm: '1 1 240px' }, minWidth: 0 }}
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

/**
 * The quiet line under a list that explains why its count may differ from
 * another screen's.
 *
 * `onToggle` makes it a door rather than a dead end, for the lists where a
 * paused student still holds something worth reading (a score they really did
 * sit for). Omitted, it stays the plain sentence every other list shows.
 */
export function PausedFootnote({
  count,
  shown = false,
  onToggle,
}: {
  count: number;
  /** True while the paused students are in the list, so the button offers Hide. */
  shown?: boolean;
  onToggle?: () => void;
}) {
  const text = pausedFootnote(count);
  if (!text && !onToggle) return null;
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ mt: 1.5, textAlign: 'center' }}
      data-testid="paused-footnote"
    >
      {text ?? (shown ? 'Paused students are in the list below.' : null)}
      {onToggle && (
        <Button
          size="small"
          onClick={onToggle}
          sx={{
            minHeight: 44,
            ml: 0.5,
            textTransform: 'none',
            fontWeight: 700,
            '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {shown ? 'Hide them' : 'Show them'}
        </Button>
      )}
    </Typography>
  );
}
