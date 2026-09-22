'use client';

import { useCallback, useState } from 'react';
import { MAX_STUDENT_TEST_QUESTIONS } from '@/lib/test-limits';

interface UseTestSelectionOptions {
  /** Every id matching the current filters, not just what is loaded. */
  fetchAllIds: () => Promise<string[]>;
  /** What to fall back to when that request fails: the ids on screen. */
  visibleIds: () => string[];
  onNotice: (message: string) => void;
}

export interface TestSelection {
  active: boolean;
  ids: Set<string>;
  /** "Select all" swept the filters, rather than the student picking by hand. */
  viaSelectAll: boolean;
  start: (firstId?: string) => void;
  exit: () => void;
  toggle: (id: string) => void;
  selectAll: () => Promise<void>;
}

/**
 * Choosing questions for a practice test.
 *
 * Lifted from the practice page unchanged in its rules: capped at
 * MAX_STUDENT_TEST_QUESTIONS and said out loud when the cap bites, and any hand
 * toggle means the paper no longer claims to be a clean sweep of the filters.
 * A sweep is a student exploring; the same size picked one by one is a student
 * working through something, and the teacher reads the two differently.
 */
export function useTestSelection({ fetchAllIds, visibleIds, onNotice }: UseTestSelectionOptions): TestSelection {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [viaSelectAll, setViaSelectAll] = useState(false);

  const start = useCallback((firstId?: string) => {
    setActive(true);
    setViaSelectAll(false);
    setIds(firstId ? new Set([firstId]) : new Set());
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    setIds(new Set());
    setViaSelectAll(false);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const alreadyOn = ids.has(id);
      // Read the size outside the updater: a setState call inside one is a side
      // effect React is entitled to run twice.
      if (!alreadyOn && ids.size >= MAX_STUDENT_TEST_QUESTIONS) {
        onNotice(`A practice test tops out at ${MAX_STUDENT_TEST_QUESTIONS} questions.`);
        return;
      }
      setViaSelectAll(false);
      setIds((prev) => {
        const next = new Set(prev);
        if (alreadyOn) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [ids, onNotice],
  );

  const selectAll = useCallback(async () => {
    try {
      const all = await fetchAllIds();
      // Capped, and said out loud. Selecting every one of 544 matches and then
      // being refused at Create is worse than being told here how many were taken.
      const capped = all.slice(0, MAX_STUDENT_TEST_QUESTIONS);
      setViaSelectAll(true);
      setIds(new Set(capped));
      if (all.length > capped.length) {
        onNotice(
          `Selected the first ${capped.length} of ${all.length} matches. A practice test tops out at ${MAX_STUDENT_TEST_QUESTIONS}.`,
        );
      }
    } catch {
      // Only what is on screen, and NOT recorded as a clean sweep.
      setViaSelectAll(false);
      setIds(new Set(visibleIds().slice(0, MAX_STUDENT_TEST_QUESTIONS)));
    }
  }, [fetchAllIds, visibleIds, onNotice]);

  return { active, ids, viaSelectAll, start, exit, toggle, selectAll };
}
