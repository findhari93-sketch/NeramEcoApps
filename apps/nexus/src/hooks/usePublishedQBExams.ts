'use client';

import { useMemo } from 'react';
import type { QBExamType } from '@neram/database';
import { useNexusAuthContext } from './useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { QB_EXAM_ORDER, isQBExamType } from '@/lib/qb-exam-routes';

interface PublishedExamsResponse {
  data?: { published_exams?: unknown[] };
}

/**
 * The exams with at least one published paper, in sidebar order, for the
 * student Question Bank folder. Null while the answer is out.
 *
 * Whether the folder shows at all is the `student.question-bank` flag alone,
 * applied by StudentZoneProvider. This used to be `useQBAccess`, which also
 * asked a per-classroom switch that Features could not see; see qb-auth.ts.
 *
 * Asked only by a student whose Question Bank is on, since nobody else renders
 * the folder. A failed request reads as nothing published, which still lists
 * the first exam (see `studentSidebarExams`).
 */
export function usePublishedQBExams(): readonly QBExamType[] | null {
  const { tokenReady, isStudent, featureFlags } = useNexusAuthContext();
  const wanted = tokenReady && isStudent && isFeatureEnabled('student.question-bank', featureFlags);
  const { data, error } = useAuthSWR<PublishedExamsResponse>(
    wanted ? '/api/question-bank/published-exams' : null,
  );

  const listed = data?.data?.published_exams;
  return useMemo(() => {
    if (error) return [];
    if (!listed) return null;
    return QB_EXAM_ORDER.filter((exam) => listed.some((v) => isQBExamType(v) && v === exam));
  }, [error, listed]);
}
