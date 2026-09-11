/**
 * Where the teacher test page opens, and which run its numbers are about.
 *
 * The page used to be Overview (the question list) and Results (two more tabs,
 * one of which listed the same questions again). It is now three flat tabs,
 * the way a Microsoft Form or a Google Form is laid out: Questions, Students,
 * Settings. Old links still land in the right place.
 */

import { canBuildRoster, classifyRunDoor } from '@/lib/test-run-scope';

export type TestPageTab = 'questions' | 'students' | 'settings';

export const TEST_PAGE_TABS: TestPageTab[] = ['questions', 'students', 'settings'];

/**
 * The tab a URL opens on.
 *
 * `results` is the old name for what is now Students, and is still what the
 * Conducted tab and the teacher's test notifications link to. `overview` was
 * the question list, which is now Questions. Anything else opens Questions.
 */
export function resolveTestPageTab(raw: string | null | undefined): TestPageTab {
  switch (raw) {
    case 'students':
    case 'results':
      return 'students';
    case 'settings':
      return 'settings';
    default:
      return 'questions';
  }
}

export interface RunPlacement {
  id: string;
  context_type: string;
  available_from: string | null;
  available_until: string | null;
}

/**
 * Which run the page's numbers are about when the URL does not say.
 *
 * The most recent run that has a roster, because "how did my class do, and who
 * has not done it" is what a teacher opens a paper to find out, and only a run
 * with a roster can answer the second half. With none, every attempt of all
 * time (the empty id).
 */
export function pickDefaultRunId(placements: RunPlacement[], urlRunId?: string | null): string {
  if (urlRunId) return urlRunId;
  let best: RunPlacement | null = null;
  let bestAt = '';
  for (const p of placements || []) {
    const contextType = String(p.context_type);
    // A practice pool is anchored to a classroom, so it can list the class,
    // but nobody owes it a sitting and there is nobody to chase.
    if (!canBuildRoster(contextType) || classifyRunDoor(contextType) === 'practice') continue;
    const at = p.available_from || p.available_until || '';
    if (!best || at > bestAt) {
      best = p;
      bestAt = at;
    }
  }
  return best?.id ?? '';
}
