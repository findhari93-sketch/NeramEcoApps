import type { NexusQBOriginalPaper } from '@neram/database';

/**
 * A paper row as the list page receives it, i.e. the base row plus the roll-up
 * the `breakdown=1` query adds.
 *
 * The three extras are optional here and required in the database layer's
 * `NexusQBPaperWithBreakdown`, because this page also renders rows it has
 * patched locally after a delete.
 */
export interface PaperWithBreakdown extends NexusQBOriginalPaper {
  section_breakdown?: Record<string, number>;
  active_count?: number;
  hindi_count?: number;
}

/**
 * Three densities for the same list.
 *
 * `table` is the scanning view and the default: 26 papers do not fit on a
 * screen as cards, and the question a teacher opens this page with is usually
 * "which one still needs work", which is a comparison across rows.
 * `cards` is the original detailed view, kept for the one paper you are about
 * to act on. `grid` sits between them.
 */
export const PAPER_VIEWS = ['table', 'grid', 'cards'] as const;
export type PaperView = (typeof PAPER_VIEWS)[number];

/** Matches the `nexus:<surface>:<setting>` convention used across the app. */
export const PAPER_VIEW_STORAGE_KEY = 'nexus:qbPapers:view';

export const PAPER_STATUSES = ['all', 'live', 'ready', 'needsWork', 'empty'] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];
/** Every status a paper can actually be in, i.e. the buckets minus the reset. */
export type PaperBucket = Exclude<PaperStatus, 'all'>;

export const PAPER_STATUS_LABELS: Record<PaperStatus, string> = {
  all: 'All',
  live: 'Live',
  ready: 'Ready to publish',
  needsWork: 'Needs work',
  empty: 'Empty',
};

export const PAPER_SORTS = ['recent', 'year', 'questions', 'leastReady'] as const;
export type PaperSort = (typeof PAPER_SORTS)[number];

export const PAPER_SORT_LABELS: Record<PaperSort, string> = {
  recent: 'Newest upload',
  year: 'Exam year',
  questions: 'Most questions',
  leastReady: 'Least ready first',
};

/**
 * The five mutations the list can start, passed down to whichever view is
 * showing.
 *
 * Every per-row handler takes the event because the row itself navigates: each
 * one calls `stopPropagation` before anything else, or acting on a paper would
 * also open it.
 */
export interface PaperActionHandlers {
  onOpen: (paperId: string) => void;
  onActivate: (paperId: string, e: React.MouseEvent) => void;
  onDeactivate: (paperId: string, e: React.MouseEvent) => void;
  onSetVisibility: (paperId: string, visible: boolean, e: React.MouseEvent) => void;
  onRequestDelete: (paperId: string, paperLabel: string, e: React.MouseEvent) => void;
  /** One action in flight app-wide, keyed `${paperId}-${verb}`. */
  actionLoading: string | null;
}

export interface PaperViewProps {
  papers: PaperWithBreakdown[];
  actions: PaperActionHandlers;
  getCategoryLabel: (cat: string) => string;
  formatDate: (dateStr: string) => string;
}
