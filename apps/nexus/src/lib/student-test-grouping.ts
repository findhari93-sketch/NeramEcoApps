/**
 * Bucketing a student's self-built papers so a teacher can read the pile.
 *
 * The problem this solves: a student who has built nine papers appears as nine
 * near-identical rows, all titled some variant of "Practice - 25 questions". The
 * fact worth seeing is not in any one row, it is in the shape of the set, that
 * all nine are Perspective. Flat lists cannot show that.
 *
 * Two axes, because they answer different questions:
 *   * BY TOPIC   what is this student drilling, from the tags on the questions
 *                they picked. Derived, so it is present on every paper ever
 *                built, including the ones from before folders existed.
 *   * BY FOLDER  how this student has chosen to organise themselves. Their own
 *                names, not ours. Empty for a student who has never made a
 *                folder, which is itself the answer to "are they organising".
 *
 * Pure TypeScript, no JSX and no next/* imports, so it is unit-testable and the
 * component cannot drift from what the tests assert.
 */

import type { NexusTestContentSummary } from '@neram/database';
import { categoryLabel, meaningfulCategories } from './test-provenance';

/**
 * The least a test must carry to be grouped. Deliberately structural rather than
 * the full row type: this file must not have an opinion about attempts, scores
 * or reasons, and taking the whole row would invite one.
 */
export interface GroupableTest {
  id: string;
  folder_name?: string | null;
  content_summary?: NexusTestContentSummary | null;
  created_at?: string | null;
}

export interface TestGroup<T> {
  /** Stable identity for React keys and for tests to assert on. */
  key: string;
  label: string;
  tests: T[];
}

/** Papers whose questions carry no tags at all, and papers built before provenance existed. */
export const UNCATEGORIZED_KEY = '__uncategorized__';
/** folder_id IS NULL. A real bucket, never hidden: unfiled is a state, not an absence. */
export const UNFILED_KEY = '__unfiled__';

/**
 * The one tag that best describes a paper.
 *
 * `meaningfulCategories` has already dropped any tag covering the whole paper,
 * which is the important part: without it every single paper in the bank groups
 * under "Aptitude" and the view says nothing. Of what is left, the tag on the
 * most questions wins.
 *
 * Ties break on the slug rather than on input order, so two papers with the same
 * 10/10 split always land in the SAME bucket. Left to array order they would
 * split across two groups depending on how PostgREST happened to sort the JSON,
 * and a teacher would see "Perspective (1)" and "Scale (1)" instead of one group
 * of two.
 */
export function dominantCategory(
  summary: NexusTestContentSummary | null | undefined,
): { slug: string; n: number } | null {
  if (!summary) return null;
  const cats = meaningfulCategories(summary);
  if (cats.length === 0) return null;
  return [...cats].sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug))[0];
}

/**
 * Order groups by size, largest first, and alphabetically within a tie.
 *
 * Size first because the whole point is spotting the pile: "nine Perspective
 * papers" should be the first thing on screen, not the ninth. The catch-all
 * buckets are pinned last however large they grow, since "Not categorized (12)"
 * leading the list would bury every group that actually means something.
 */
function orderGroups<T>(groups: Map<string, TestGroup<T>>, trailingKeys: string[]): Array<TestGroup<T>> {
  return [...groups.values()].sort((a, b) => {
    const aTrails = trailingKeys.includes(a.key);
    const bTrails = trailingKeys.includes(b.key);
    if (aTrails !== bTrails) return aTrails ? 1 : -1;
    return b.tests.length - a.tests.length || a.label.localeCompare(b.label);
  });
}

/** Group papers by the tag that best describes each one. */
export function groupByDominantCategory<T extends GroupableTest>(
  tests: T[],
  categoryLabels?: Record<string, string>,
): Array<TestGroup<T>> {
  const groups = new Map<string, TestGroup<T>>();

  for (const test of tests) {
    const top = dominantCategory(test.content_summary);
    const key = top ? top.slug : UNCATEGORIZED_KEY;
    const label = top ? categoryLabel(top.slug, categoryLabels) : 'Not categorized';
    const existing = groups.get(key);
    if (existing) existing.tests.push(test);
    else groups.set(key, { key, label, tests: [test] });
  }

  return orderGroups(groups, [UNCATEGORIZED_KEY]);
}

/** Group papers by the folder the student filed them in. */
export function groupByFolder<T extends GroupableTest>(tests: T[]): Array<TestGroup<T>> {
  const groups = new Map<string, TestGroup<T>>();

  for (const test of tests) {
    const name = test.folder_name?.trim();
    const key = name || UNFILED_KEY;
    const label = name || 'Unfiled';
    const existing = groups.get(key);
    if (existing) existing.tests.push(test);
    else groups.set(key, { key, label, tests: [test] });
  }

  return orderGroups(groups, [UNFILED_KEY]);
}

/**
 * Has this student organised anything at all?
 *
 * Used to decide whether the Folder view is worth offering. Showing a student's
 * entire output under a single "Unfiled" heading is a grouping that groups
 * nothing, and it reads as a broken toggle rather than as an honest answer.
 */
export function hasAnyFolder(tests: GroupableTest[]): boolean {
  return tests.some((t) => Boolean(t.folder_name?.trim()));
}
