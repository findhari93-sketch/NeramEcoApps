'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

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
 *
 * A hook because only useSWRConfig().mutate reaches the app's own cache (see
 * useRevalidateClass in lib/nexus-swr.ts); the `mutate` exported by 'swr' does not.
 */
export function useRefreshStudentStageFacts(): () => Promise<unknown> {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(STAGE_FACTS_KEY), [mutate]);
}
