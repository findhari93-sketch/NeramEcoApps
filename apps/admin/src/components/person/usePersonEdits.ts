'use client';

/**
 * Saving what staff learn about a person, from the language chip or any avatar.
 *
 * Every save is optimistic: every avatar of this person on screen changes at
 * once (through the facts provider), the PATCH runs behind it, and a failure
 * puts the old value back and hands the message to the caller to show.
 */
import { useCallback, useState } from 'react';
import type { LanguageKey } from '@neram/ui';
import type { PersonFacts } from '@/lib/person-avatar';
import type { StudyStage } from '@/lib/person-study';
import { usePersonFacts, useUpdatePersonFacts } from './PersonFactsProvider';

export interface LanguagePatch {
  homeLanguage?: LanguageKey | null;
  limitedEnglish?: boolean;
}

export interface StudiesPatch {
  studyStage: StudyStage | null;
  twelfthPassedYear?: number | null;
}

export function usePersonEdits(userId: string | null | undefined) {
  const { facts } = usePersonFacts(userId);
  const updateFacts = useUpdatePersonFacts();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (
      path: string,
      body: unknown,
      optimistic: Partial<PersonFacts>,
      previous: Partial<PersonFacts>,
      fallback: string,
      /** Ask the server again once saved: a cleared value has a fallback only it can work out. */
      refetch = false,
    ) => {
      if (!userId || !facts) return false;
      updateFacts(userId, optimistic);
      setSaving(true);
      try {
        const res = await fetch(`/api/crm/users/${userId}/${path}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || fallback);
        if (refetch) updateFacts(userId, {}, true);
        return true;
      } catch (err) {
        updateFacts(userId, previous);
        setError(err instanceof Error ? err.message : fallback);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [userId, facts, updateFacts],
  );

  const saveLanguage = useCallback(
    (patch: LanguagePatch) =>
      send(
        'language',
        patch,
        patch,
        { homeLanguage: facts?.homeLanguage ?? null, limitedEnglish: facts?.limitedEnglish ?? false },
        'Could not save the language',
        patch.homeLanguage === null,
      ),
    [send, facts],
  );

  const saveStudies = useCallback(
    ({ studyStage, twelfthPassedYear = null }: StudiesPatch) => {
      const year = studyStage === 'gap_year' ? twelfthPassedYear : null;
      return send(
        'studies',
        { studyStage, twelfthPassedYear: year },
        studyStage
          ? { currentStandard: studyStage, studySource: 'staff', twelfthPassedYear: year }
          : { currentStandard: null, studySource: null, twelfthPassedYear: null },
        {
          currentStandard: facts?.currentStandard ?? null,
          studySource: facts?.studySource ?? null,
          twelfthPassedYear: facts?.twelfthPassedYear ?? null,
        },
        'Could not save the class',
        // Cleared: the application or demo booking may still say something.
        studyStage === null,
      );
    },
    [send, facts],
  );

  return { facts, saving, error, clearError: () => setError(null), saveLanguage, saveStudies };
}
