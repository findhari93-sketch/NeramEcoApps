'use client';

import { useNexusSWR } from '@/lib/nexus-swr';
import type { Insights } from './types';

/** The one cache key for a class's insights, shared by the drawer card and the panel. */
export function insightsKey(classId: string, classroomId: string): string {
  return `/api/timetable/class-insights?class_id=${classId}&classroom_id=${classroomId}`;
}

/**
 * Everything about one class's attendance and follow-up.
 *
 * `dedupingInterval: 0` because the panel writes to what this reads (a sync, a
 * manual mark, a nudge stamping "last nudged"): the app-wide 15 second dedupe
 * would otherwise hand the next screen the answer from before the write.
 * Two components mounted together still share one request.
 */
export function useClassInsights(
  classId: string | null,
  classroomId: string | null,
  getToken: () => Promise<string | null>,
) {
  return useNexusSWR<Insights>(
    classId && classroomId ? insightsKey(classId, classroomId) : null,
    getToken,
    { dedupingInterval: 0 },
  );
}
