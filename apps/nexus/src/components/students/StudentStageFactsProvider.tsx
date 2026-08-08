'use client';

import { createContext, useContext, useMemo } from 'react';
import { useAuthSWR } from '@/lib/nexus-swr';
import { stageKeyOf, type StageKey } from '@/lib/student-stage';

/**
 * Who each student is, fetched once and readable from any avatar on screen.
 *
 * The classification already existed and was already rendered, on precisely four
 * screens: the students list, the profile header, the class prep roster and the
 * attendance register. Everywhere else, a face was just a face, so a teacher
 * scanning a drawing-review queue or a leaderboard could not tell a Class 11
 * student from one sitting the exam in three months. That is the difference
 * between "reply to this later" and "reply to this tonight".
 *
 * Threading two more columns through the twenty routes those screens read was
 * the obvious fix and the wrong one: twenty payload changes, and the twenty-first
 * screen built next month would be missing it again. One cached lookup keyed by
 * user id makes the badge a property of the avatar rather than of the payload.
 *
 * The photo and the name ride along for exactly that reason. Plenty of screens
 * carry a student's id and nothing else, and before this they showed coloured
 * initials forever unless someone widened their route. Now a bare id is enough
 * to draw the real person.
 *
 * Mounted in the TEACHER layout only. A student page renders with an empty map,
 * every avatar falls back to plain, and nothing leaks. See the route for why
 * that matters more for dormancy than for the stage.
 */

export interface StudentStageFacts {
  /** Their study stage, or `unset` when nobody has recorded one. */
  stage: StageKey;
  /** Enrolled but paused. Never shown to other students. */
  dormant: boolean;
  /** users.avatar_url, so a screen holding only an id still shows the real face. */
  photo: string | null;
  /** users.name, so a screen holding only an id still shows the real name. */
  name: string | null;
}

interface StageFactsContextValue {
  /** Null for anyone who is not a known active student: staff, alumni, a parent. */
  factsFor: (userId: string | null | undefined) => StudentStageFacts | null;
  /** False until the first response lands, so callers can hold off on a ring. */
  ready: boolean;
}

const StageFactsContext = createContext<StageFactsContextValue>({
  factsFor: () => null,
  ready: false,
});

export function useStudentStageFacts(): StageFactsContextValue {
  return useContext(StageFactsContext);
}

interface Payload {
  facts: Record<
    string,
    { stage: string | null; dormant: boolean; photo: string | null; name: string | null }
  >;
}

export default function StudentStageFactsProvider({ children }: { children: React.ReactNode }) {
  /**
   * One request per session, and no revalidation storm.
   *
   * A student's stage changes when a manager sets it, which is a handful of
   * times a term, so refetching on every window focus would buy nothing and cost
   * a function invocation each time a teacher alt-tabs back. An hour of
   * deduping means walking between eight screens costs one request in total.
   */
  const { data } = useAuthSWR<Payload>('/api/students/stage-facts', {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 3_600_000,
    // Decoration. A failed lookup must degrade to a plain avatar in silence
    // rather than retry in a loop behind a screen nobody is looking at.
    shouldRetryOnError: false,
  });

  const value = useMemo<StageFactsContextValue>(() => {
    const raw = data?.facts;
    if (!raw) return { ready: false, factsFor: () => null };

    // Normalise once into a Map rather than per call. Beyond the obvious, this
    // gives each fact a STABLE identity, so factsFor(id) can safely be a
    // useMemo or React.memo dependency. Rebuilding the object on every call
    // would silently defeat any such memo, and that is a hard bug to see.
    const byId = new Map<string, StudentStageFacts>();
    for (const [id, row] of Object.entries(raw)) {
      byId.set(id, {
        stage: stageKeyOf(row.stage),
        dormant: !!row.dormant,
        photo: row.photo ?? null,
        name: row.name ?? null,
      });
    }

    return { ready: true, factsFor: (userId) => (userId ? byId.get(userId) ?? null : null) };
  }, [data]);

  return <StageFactsContext.Provider value={value}>{children}</StageFactsContext.Provider>;
}
