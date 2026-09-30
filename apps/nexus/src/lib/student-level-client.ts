'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { STAGE_FACTS_KEY } from '@/lib/stage-facts-cache';
import { overallLevel, type LevelKey, type LevelSource } from '@/lib/student-level';
import type { SkillLevelWriteResult } from '@/lib/student-level-types';

export const snapshotKey = (studentId: string) => `/api/students/${studentId}/snapshot`;

interface FactsCache {
  facts: Record<string, Record<string, unknown>>;
  count?: number;
}

/** Writes a drawing level into the cached lookup, so every avatar moves at once. */
function patchFacts(cache: FactsCache | undefined, studentId: string, level: LevelKey | null): FactsCache | undefined {
  const fact = cache?.facts?.[studentId];
  if (!cache || !fact) return cache;
  return {
    ...cache,
    facts: {
      ...cache.facts,
      [studentId]: { ...fact, drawingLevel: level, overallLevel: overallLevel({ drawing: level }) },
    },
  };
}

/**
 * Sets (or clears) a student's drawing level.
 *
 * The avatar bars move before the server answers: the stage-facts cache is
 * patched first, then the PUT goes out, and a failure puts the old value back
 * and rethrows so the screen can say so. The open snapshot, if any, refetches.
 */
export function useSetDrawingLevel(): (
  studentId: string,
  level: LevelKey | null,
  source: LevelSource,
  previousForRollback: LevelKey | null,
) => Promise<SkillLevelWriteResult> {
  const { getToken } = useNexusAuthContext();
  const { mutate } = useSWRConfig();

  return useCallback(
    async (studentId, level, source, previousForRollback) => {
      await mutate<FactsCache>(STAGE_FACTS_KEY, (c) => patchFacts(c, studentId, level), { revalidate: false });
      try {
        const token = await getToken();
        if (!token) throw new Error('Session expired. Please refresh the page and try again.');
        const res = await fetch(`/api/students/${studentId}/skill-level`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill: 'drawing', level, source }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'Could not save the level');
        void mutate(snapshotKey(studentId));
        return body as SkillLevelWriteResult;
      } catch (err) {
        await mutate<FactsCache>(STAGE_FACTS_KEY, (c) => patchFacts(c, studentId, previousForRollback), {
          revalidate: false,
        });
        throw err;
      }
    },
    [getToken, mutate],
  );
}
