'use client';

/**
 * Every student's avatar ring (stage, level, language) on the teacher's pad
 * screens, as the rest of Nexus shows it. The Nexus provider reads the Nexus
 * session, which the pad in Teams does not have, so this fetches the same
 * lookup with the pad's own Teams token: once per console, no refetch on focus.
 * A failed lookup leaves plain avatars, in silence.
 */

import type { ReactNode } from 'react';
import useSWR from 'swr';
import { StageFactsDataProvider, type StageFactsPayload } from '@/components/students/StudentStageFactsProvider';
import { padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import { STAGE_FACTS_KEY } from '@/lib/stage-facts-cache';

export default function PadStageFactsProvider({ host, children }: { host: PadHost; children: ReactNode }) {
  const { data } = useSWR<StageFactsPayload>(['pad', STAGE_FACTS_KEY], () => padFetch<StageFactsPayload>(host, STAGE_FACTS_KEY), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 3_600_000,
    shouldRetryOnError: false,
  });
  return <StageFactsDataProvider data={data}>{children}</StageFactsDataProvider>;
}
