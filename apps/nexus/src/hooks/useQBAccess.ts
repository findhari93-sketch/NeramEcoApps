'use client';

import { useState, useEffect, useRef } from 'react';
import { useNexusAuthContext } from './useNexusAuth';

/**
 * Checks whether the Question Bank is enabled for the student's active classroom.
 * Returns { isQBEnabled, loading }. For teachers/admins, always returns true.
 */
export function useQBAccess() {
  const { activeClassroom, getToken, isStudent, isTeacher } = useNexusAuthContext();
  const [isQBEnabled, setIsQBEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    // Teachers/admins always have QB access via management panel
    if (isTeacher) {
      setIsQBEnabled(true);
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
      setIsQBEnabled(cached);
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
            const enabled = json.data?.enabled === true;
            cacheRef.current.set(activeClassroom!.id, enabled);
            setIsQBEnabled(enabled);
          } else {
            setIsQBEnabled(false);
          }
        }
      } catch {
        if (!cancelled) setIsQBEnabled(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [activeClassroom?.id, isStudent, isTeacher, getToken]);

  return { isQBEnabled, loading };
}
