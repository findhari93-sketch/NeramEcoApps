'use client';

import { useMemo } from 'react';
import type { QBReportGroup } from '@neram/database';
import { useNexusSWR } from '@/lib/nexus-swr';

const NONE: Record<string, QBReportGroup[]> = {};

/**
 * Open student reports on a paper's questions, keyed by question id.
 *
 * A failed request reads as "no reports" rather than an error: the reports
 * are an extra on the paper, and the paper must never break because of them.
 * No dedupe window, because the teacher closing a report is what changes it.
 */
export function usePaperReports(paperId: string | undefined, getToken: () => Promise<string | null>) {
  const { data, mutate } = useNexusSWR<{ data: Record<string, QBReportGroup[]> }>(
    paperId ? `/api/question-bank/papers/${paperId}/reports` : null,
    getToken,
    { dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: true },
  );
  const byQuestion = useMemo(() => data?.data ?? NONE, [data]);
  return { byQuestion, refresh: () => mutate() };
}
