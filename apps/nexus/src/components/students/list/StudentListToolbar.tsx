'use client';

import type { ReactNode } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import PeopleSearchField from '@/components/PeopleSearchField';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { pausedFootnote } from '@/lib/student-list-view';
import FilterMenu, { ActiveFilterChips, FilterChipRow, type FilterSection } from './FilterMenu';
import ListSortMenu from './ListSortMenu';
import StageFilter, { useStageFilterSection } from './StageFilter';
import type { StudentListView } from './useStudentListView';

/** Below this many pixels of its own width, the toolbar folds its filters into one menu. */
export const TOOLBAR_COMPACT_BELOW = 720;

/**
 * Search, sort and the stage filter for a list of students.
 *
 * Wide (a full page on a laptop): one row with the stage chips inline, and any
 * screen filters (`filters`) as chip rows under it.
 *
 * Compact (a drawer, a dialog, a side panel, a phone): ONE row of search, an
 * icon Sort button and a single Filter button that holds the stage filter and
 * every screen filter, with a thin line of removable chips for whatever is on.
 * The choice follows the width of the toolbar itself, not the window, so a
 * list inside a 480px drawer on a laptop is compact too.
 *
 * Render it above `view.shown` from useStudentListView. Put status cards above
 * it with `statusSlot` and screen actions (export, select) with `actionsSlot`.
 */
export default function StudentListToolbar<T, S extends string, F extends string>({
  view,
  searchLabel = 'Find a student',
  statusSlot,
  actionsSlot,
  filters,
  sticky = false,
  dense = false,
  compact = 'auto',
}: {
  view: StudentListView<T, S, F>;
  searchLabel?: string;
  statusSlot?: ReactNode;
  actionsSlot?: ReactNode;
  /** The screen's own filters. Chip rows when wide, sections of the Filter menu when compact. */
  filters?: readonly FilterSection[];
  /** Keep search and filters in reach while a long list scrolls. */
  sticky?: boolean;
  /**
   * Search shares the phone row with Sort and Stage instead of taking a row of
   * its own. For screens where the list below needs every pixel of height (the
   * attendance register fills the rest of the screen).
   */
  dense?: boolean;
  /** 'auto' measures the toolbar; true or false forces a form. */
  compact?: boolean | 'auto';
}) {
  const [ref, width] = useContainerWidth();
  const isCompact = compact === 'auto' ? width != null && width < TOOLBAR_COMPACT_BELOW : compact;
  const stageSection = useStageFilterSection({
    value: view.stages,
    counts: view.stageCounts,
    onToggle: view.toggleStage,
    onClear: view.clearStages,
    disabled: !view.stageReady,
  });
  const extra = filters ?? [];

  return (
    <Box
      ref={ref}
      data-compact={isCompact ? 'true' : 'false'}
      sx={{
        mb: 1.5,
        ...(sticky ? { position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.default', pt: 1 } : {}),
      }}
    >
      {statusSlot}
      {isCompact ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleSearchField
              value={view.query}
              onChange={view.setQuery}
              label={searchLabel}
              placeholder="Search"
              resultCount={view.shown.length}
              sx={{ flex: '1 1 120px', minWidth: 0 }}
            />
            <ListSortMenu value={view.sort} options={view.sortOptions} onChange={view.setSort} compact />
            <FilterMenu sections={[...extra, stageSection]} />
            {actionsSlot && <Box sx={{ display: 'flex', gap: 1 }}>{actionsSlot}</Box>}
          </Box>
          <ActiveFilterChips sections={[...extra, stageSection]} />
        </>
      ) : (
        <>
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
          {extra.map((f) => (
            <FilterChipRow key={f.id} section={f} />
          ))}
        </>
      )}
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
