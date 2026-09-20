'use client';

import { mutate } from 'swr';

/**
 * The SWR key of the session-wide student lookup (StudentStageFactsProvider).
 *
 * Its own file, not an export of the provider, because several component tests
 * `vi.mock` the provider module with a partial factory, and a save handler that
 * imported this from there would get `undefined` under those mocks.
 */
export const STAGE_FACTS_KEY = '/api/students/stage-facts';

/**
 * Refetch the lookup now, after a write that changed who a student is.
 *
 * The provider dedupes for an hour and never revalidates on focus, which is right
 * for reads and wrong straight after a save: without this, a student just marked
 * as Hindi would keep a bare corner on every other screen for up to an hour.
 * The one-argument form refetches underneath the data already on screen rather
 * than blanking it first.
 */
export function refreshStudentStageFacts(): Promise<unknown> {
  return mutate(STAGE_FACTS_KEY);
}
