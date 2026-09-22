'use client';

import { useCallback, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, EmptyState, Skeleton } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import type { QBFilterState } from '@neram/database';
import QBSearchStatus from '../QBSearchStatus';
import TopFilterBar from '../TopFilterBar';
import { sourceLabel } from '@/lib/qb-paper-number';
import type { PracticeSession } from './usePracticeSession';
import type { TestSelection } from './useTestSelection';
import QuestionPalette from './QuestionPalette';
import QuestionRow from './QuestionRow';
import PracticeSearchField from './PracticeSearchField';
import ViewToggle, { type PracticeView } from './ViewToggle';
import { topicCaption } from './practice-logic';

interface PracticeBrowserProps {
  /** `rail`: a column that scrolls on its own. `page`: flows with the phone's page. */
  variant: 'rail' | 'page';
  session: PracticeSession;
  view: PracticeView;
  onViewChange: (v: PracticeView) => void;
  /** The grid means something only inside one paper, with no search reordering it. */
  gridAvailable: boolean;
  searchInput: string;
  onSearchInput: (value: string) => void;
  filters: QBFilterState;
  onFiltersChange: (filters: QBFilterState) => void;
  onOpenDrawer: () => void;
  activeFilterCount: number;
  categoryLabels: Record<string, string>;
  lang: 'en' | 'hi';
  onOpen: (id: string) => void;
  selection: TestSelection;
  /** Pinned under the list in the rail, e.g. the selection bar. */
  footer?: ReactNode;
  /** The id of the question being read, highlighted in the list. */
  activeId: string | null;
}

/**
 * Finding a question: search, filters, and the paper as a grid or a list.
 *
 * The same pieces serve the laptop rail, where only the list scrolls, and the
 * phone's list screen, where the whole page does.
 */
export default function PracticeBrowser({
  variant,
  session,
  view,
  onViewChange,
  gridAvailable,
  searchInput,
  onSearchInput,
  filters,
  onFiltersChange,
  onOpenDrawer,
  activeFilterCount,
  categoryLabels,
  lang,
  onOpen,
  selection,
  footer,
  activeId,
}: PracticeBrowserProps) {
  const rail = variant === 'rail';
  const showGrid = gridAvailable && view === 'grid';
  const inPaper = session.scope === 'paper';

  const toggleSelect = selection.toggle;
  const open = useCallback((id: string) => onOpen(id), [onOpen]);

  const controls = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <PracticeSearchField
        value={searchInput}
        onChange={onSearchInput}
        placeholder={inPaper ? 'Search this paper' : 'Search questions, formulas, topics...'}
      />
      <QBSearchStatus
        query={filters.search_text ?? ''}
        matchKind={session.search.matchKind}
        didYouMean={session.search.didYouMean}
        total={session.total}
        loading={session.loading}
        onUseSuggestion={(term) => onSearchInput(term)}
        onClear={() => onSearchInput('')}
      />
      <TopFilterBar
        filters={filters}
        onFilterChange={onFiltersChange}
        onOpenDrawer={onOpenDrawer}
        activeFilterCount={activeFilterCount}
        // In the narrow rail the five quick chips would wrap into three rows,
        // and each only opens the drawer that Filters opens.
        isYearPaperView={rail || session.scope !== 'bank'}
        categoryLabels={categoryLabels}
        trailing={gridAvailable ? <ViewToggle value={view} onChange={onViewChange} /> : undefined}
      />
    </Box>
  );

  let content: ReactNode;
  if (session.loading && session.questions.length === 0) {
    content = showGrid ? (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 1 }}>
        {Array.from({ length: 20 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={44} sx={{ borderRadius: '10px' }} />
        ))}
      </Box>
    ) : (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={68} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  } else if (session.error) {
    content = (
      <Alert
        severity="warning"
        sx={{ borderRadius: 2 }}
        action={
          <Button color="inherit" onClick={session.reload} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        }
      >
        {session.error}
      </Alert>
    );
  } else if (session.questions.length === 0) {
    content = (
      <EmptyState
        icon={<QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary' }} />}
        title="No questions match your filters"
        description="Try removing a filter or clearing the search."
        action={
          <Button variant="outlined" onClick={() => onFiltersChange({})} sx={{ minHeight: 44 }}>
            Reset filters
          </Button>
        }
      />
    );
  } else if (showGrid) {
    content = (
      <QuestionPalette
        questions={session.questions}
        numbers={session.numbers}
        currentId={activeId}
        onOpen={open}
        selecting={selection.active}
        selectedIds={selection.ids}
        onToggleSelect={toggleSelect}
        autoReveal={rail}
      />
    );
  } else {
    content = (
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
          '& > button:last-of-type': { borderBottom: 0 },
        }}
      >
        {session.questions.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            number={session.numbers.get(q.id) ?? 0}
            current={q.id === activeId}
            lang={lang}
            topic={topicCaption(q.categories, categoryLabels)}
            source={inPaper ? null : sourceLabel(q)}
            highlight={session.search.matchedTerms}
            selecting={selection.active}
            selected={selection.ids.has(q.id)}
            onOpen={open}
            onToggleSelect={toggleSelect}
          />
        ))}
      </Box>
    );
  }

  const more = session.hasMore && !session.loading && (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
      <Button
        variant="outlined"
        onClick={session.loadMore}
        disabled={session.loadingMore}
        startIcon={session.loadingMore ? <CircularProgress size={16} /> : undefined}
        sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
      >
        {session.loadingMore ? 'Loading...' : `Load more (${session.total - session.questions.length} left)`}
      </Button>
    </Box>
  );

  // A refetch keeps the old list on screen, dimmed, rather than blanking it.
  const busy = session.loading && session.questions.length > 0;

  if (!rail) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {controls}
        <Box aria-busy={busy} sx={{ opacity: busy ? 0.6 : 1, transition: 'opacity 150ms ease' }}>
          {content}
          {more}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flexShrink: 0, p: 1.5, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>{controls}</Box>
      <Box
        data-rail-scroll
        aria-busy={busy}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          p: 1.5,
          opacity: busy ? 0.6 : 1,
          transition: 'opacity 150ms ease',
        }}
      >
        {content}
        {more}
      </Box>
      {footer}
    </Box>
  );
}
