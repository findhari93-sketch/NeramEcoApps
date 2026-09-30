'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

/**
 * Tap a student's face anywhere in the staff app and their snapshot opens: the
 * overall level, the level per skill, their latest drawings, and a way to
 * change the level (managers only).
 *
 * One provider, one sheet, mounted in the TEACHER layout only, next to
 * StudentStageFactsProvider. The student and parent zones never mount it, so a
 * face there stays a plain photo and nothing about levels can leak.
 *
 * The sheet is loaded on first open, so the ~95 screens with avatars pay
 * nothing for it until someone taps.
 */

const StudentSnapshotSheet = dynamic(() => import('./StudentSnapshotSheet'), { ssr: false });

interface SnapshotContextValue {
  openSnapshot: (userId: string) => void;
}

const SnapshotContext = createContext<SnapshotContextValue | null>(null);

/** Null outside the teacher layout, which is how an avatar knows to stay a photo. */
export function useStudentSnapshot(): SnapshotContextValue | null {
  return useContext(SnapshotContext);
}

export default function StudentSnapshotProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const openSnapshot = useCallback((id: string) => setUserId(id), []);
  const value = useMemo(() => ({ openSnapshot }), [openSnapshot]);

  return (
    <SnapshotContext.Provider value={value}>
      {children}
      {userId !== null && <StudentSnapshotSheet userId={userId} onClose={() => setUserId(null)} />}
    </SnapshotContext.Provider>
  );
}
