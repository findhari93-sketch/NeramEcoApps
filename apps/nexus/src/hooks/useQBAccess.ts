'use client';

import { useState, useEffect, useRef } from 'react';
import type { QBExamType } from '@neram/database';
import { useNexusAuthContext } from './useNexusAuth';
import { QB_EXAM_ORDER, isQBExamType } from '@/lib/qb-exam-routes';

interface QBAccess {
  enabled: boolean;
  /** Exams with at least one published paper. Staff see every exam regardless. */
  publishedExams: readonly QBExamType[];
}

const NO_ACCESS: QBAccess = { enabled: false, publishedExams: [] };

/**
 * Checks whether the Question Bank is enabled for the student's active classroom,
 * and which exams have something published in it.
 * Returns { isQBEnabled, publishedExams, loading }. For teachers/admins, always
 * enabled with every exam.
 */
export function useQBAccess() {
  const { activeClassroom, getToken, isStudent, isTeacher } = useNexusAuthContext();
  const [isQBEnabled, setIsQBEnabled] = useState<boolean | null>(null);
  const [publishedExams, setPublishedExams] = useState<readonly QBExamType[]>(QB_EXAM_ORDER);
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef<Map<string, QBAccess>>(new Map());

  useEffect(() => {
    const apply = (access: QBAccess) => {
      setIsQBEnabled(access.enabled);
      // Keep the array identity when nothing changed, so the zone provider's
      // memo does not rebuild the nav on every classroom re-check.
      setPublishedExams((prev) =>
        prev.length === access.publishedExams.length &&
        prev.every((exam, i) => exam === access.publishedExams[i])
          ? prev
          : access.publishedExams,
      );
    };

    // Teachers/admins always have QB access via management panel
    if (isTeacher) {
      apply({ enabled: true, publishedExams: QB_EXAM_ORDER });
      setLoading(false);
      return;
    }

    if (!activeClassroom || !isStudent) {
      setIsQBEnabled(null);
      setLoading(false);
      return;
    }

    const cached = cacheRef.current.get(activeClassroom.id);
    if (cached !== undefined) {
      apply(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function check() {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/question-bank/classroom-link?classroom_id=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!cancelled) {
          if (res.ok) {
            const json = await res.json();
            const listed: unknown[] = Array.isArray(json.data?.published_exams)
              ? json.data.published_exams
              : [];
            const access: QBAccess = {
              enabled: json.data?.enabled === true,
              // Sidebar order, whatever order the server answered in.
              publishedExams: QB_EXAM_ORDER.filter((exam) =>
                listed.some((v) => isQBExamType(v) && v === exam),
              ),
            };
            cacheRef.current.set(activeClassroom!.id, access);
            apply(access);
          } else {
            apply(NO_ACCESS);
          }
        }
      } catch {
        if (!cancelled) apply(NO_ACCESS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [activeClassroom?.id, isStudent, isTeacher, getToken]);

  return { isQBEnabled, publishedExams, loading };
}
