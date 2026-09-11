/**
 * Search on the teacher Photo Review page.
 *
 * The page loads one tab at a time, but a teacher looking for a student does
 * not know which tab that student is on. So the review route also sends a slim
 * index of the whole roster (id, the name the card shows, the tab), and these
 * helpers turn a query into match counts per tab: the tab chips show them while
 * a search is live, and an empty result offers "Show 2 in Approved".
 *
 * Matching is the shared people ranking (people-search.ts) over the name the
 * card shows, and nothing else. The email is left out on purpose: the cards
 * never show it, so an email hit would list a student with no visible reason.
 *
 * Pure, so the route, the client page and the tests all share it.
 */

import { matchTier, normalizeQuery } from './people-search';
import type { ReviewTab } from './photo-auto-review';

/** One student in the roster-wide search index. */
export interface PhotoSearchEntry {
  id: string;
  /** The name the card shows, see searchableName. */
  name: string;
  tab: ReviewTab;
}

/** The text a card shows for a student, which is the only text a search matches. */
export function searchableName(student: { name?: string | null; email?: string | null }): string {
  return student.name || student.email || '';
}

/**
 * Wrap rows for rankPeople with the visible name and no email key, so only what
 * the card shows can match. Map the ranked result back with `.row`.
 */
export function toSearchable<T extends { student: { name: string | null; email: string | null } }>(
  rows: T[],
): Array<{ name: string; row: T }> {
  return rows.map((row) => ({ name: searchableName(row.student), row }));
}

/** How many students on each tab match the query, or null when nothing is typed. */
export function matchCountsByTab(
  index: PhotoSearchEntry[],
  query: string,
): Record<ReviewTab, number> | null {
  const q = normalizeQuery(query);
  if (!q) return null;

  const counts: Record<ReviewTab, number> = { pending: 0, auto: 0, missing: 0, rejected: 0, approved: 0 };
  for (const entry of index) {
    if (matchTier({ name: entry.name }, q) !== null) counts[entry.tab] += 1;
  }
  return counts;
}

/** The tabs other than the open one that hold matches, in the page's tab order. */
export function otherTabsWithMatches(
  counts: Record<ReviewTab, number> | null,
  currentTab: ReviewTab,
  order: readonly ReviewTab[],
): Array<{ tab: ReviewTab; count: number }> {
  if (!counts) return [];
  return order
    .filter((tab) => tab !== currentTab && counts[tab] > 0)
    .map((tab) => ({ tab, count: counts[tab] }));
}
