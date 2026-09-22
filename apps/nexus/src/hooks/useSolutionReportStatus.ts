'use client';

import { useCallback, useMemo } from 'react';
import type { QBReportStatusEntry } from '@neram/database';
import { useNexusSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { ReportSent } from '@/components/question-bank/ReportSolutionSheet';

const EMPTY: QBReportStatusEntry = { mine: [], flagged: [] };

type StatusResponse = { data: Record<string, QBReportStatusEntry> };

/**
 * For the questions on screen: which parts this student already reported, and
 * which parts other students are warned about. One request for a whole test
 * review. No dedupe window, because the student's own report is what changes it.
 *
 * `enabled` keeps it free until a solution is actually on screen: before a
 * student submits, there is nothing to report and nothing to warn about.
 */
export function useSolutionReportStatus(questionIds: string[], enabled = true) {
  const { getToken } = useNexusAuthContext();
  const idKey = Array.from(new Set(questionIds)).sort().join(',');
  const key = enabled && idKey ? `/api/question-bank/report-status?question_ids=${idKey}` : null;

  const { data, mutate } = useNexusSWR<StatusResponse>(key, getToken, {
    dedupingInterval: 0,
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  const statusFor = useCallback((questionId: string) => data?.data?.[questionId] ?? EMPTY, [data]);

  /** Show "You reported this" at once, without waiting for a refetch. */
  const markReported = useCallback(
    (questionId: string, sent: ReportSent) => {
      void mutate(
        (prev) => {
          const all = prev?.data ?? {};
          const current = all[questionId] ?? EMPTY;
          return {
            data: {
              ...all,
              [questionId]: {
                ...current,
                mine: [...current.mine, { target: sent.target, part_label: sent.partLabel, report_type: sent.reason }],
              },
            },
          };
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  return useMemo(() => ({ statusFor, markReported }), [statusFor, markReported]);
}
