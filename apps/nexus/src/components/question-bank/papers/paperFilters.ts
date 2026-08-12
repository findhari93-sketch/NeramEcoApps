import { derivePaperStats, paperBucket, type PaperStats } from './derivePaperStats';
import type { PaperBucket, PaperSort, PaperStatus, PaperWithBreakdown } from './paperTypes';

export interface PaperListQuery {
  search: string;
  status: PaperStatus;
  sort: PaperSort;
}

/** A paper paired with its derived numbers, so nothing recomputes them per view. */
export interface PaperRow {
  paper: PaperWithBreakdown;
  stats: PaperStats;
  bucket: PaperBucket;
}

export function toRows(papers: PaperWithBreakdown[]): PaperRow[] {
  return papers.map((paper) => {
    const stats = derivePaperStats(paper);
    return { paper, stats, bucket: paperBucket(paper, stats) };
  });
}

/**
 * How many papers sit in each bucket, for the counts on the filter chips.
 *
 * Counted over every paper rather than the filtered set, or selecting "Live"
 * would drop every other chip to zero and there would be no way to see what
 * else exists.
 */
export function countBuckets(rows: PaperRow[]): Record<PaperStatus, number> {
  const counts: Record<PaperStatus, number> = {
    all: rows.length,
    live: 0,
    ready: 0,
    needsWork: 0,
    empty: 0,
  };
  for (const row of rows) counts[row.bucket] += 1;
  return counts;
}

function matchesSearch(row: PaperRow, needle: string): boolean {
  if (!needle) return true;
  const haystack = [
    row.stats.paperLabel,
    String(row.paper.year),
    row.paper.session ?? '',
    row.paper.shift ?? '',
    row.paper.exam_type,
  ]
    .join(' ')
    .toLowerCase();
  // Every word has to appear somewhere, so "nata 2025" narrows rather than
  // widening the way a plain substring match on the whole phrase would.
  return needle
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const SORTERS: Record<PaperSort, (a: PaperRow, b: PaperRow) => number> = {
  recent: (a, b) => b.paper.created_at.localeCompare(a.paper.created_at),
  year: (a, b) => b.paper.year - a.paper.year || b.paper.created_at.localeCompare(a.paper.created_at),
  questions: (a, b) => b.stats.total - a.stats.total,
  leastReady: (a, b) => a.stats.readiness - b.stats.readiness || b.stats.total - a.stats.total,
};

/**
 * Narrow and order the list, entirely in the browser.
 *
 * There are 26 papers and the server already returns all of them in one
 * request. Pushing search and sort back to the API would buy nothing and cost a
 * function invocation per keystroke.
 */
export function queryPapers(rows: PaperRow[], { search, status, sort }: PaperListQuery): PaperRow[] {
  const needle = search.trim();
  return rows
    .filter((row) => (status === 'all' || row.bucket === status) && matchesSearch(row, needle))
    // Sorting a copy: `filter` already made one, but saying so stops the next
    // caller assuming this mutates in place.
    .sort(SORTERS[sort]);
}
