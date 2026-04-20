'use client';

import { useCallback, useEffect, useState } from 'react';

export type DrawingViewMode = 'compact' | 'comfortable';

const STORAGE_KEY = 'nexus:drawingReviews:viewMode';

function readInitial(): DrawingViewMode {
  if (typeof window === 'undefined') return 'comfortable';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'compact' ? 'compact' : 'comfortable';
}

/**
 * localStorage-backed view mode for drawing review + gallery lists.
 * Shared across the teacher and student drawing surfaces so users only
 * set their preference once.
 */
export function useDrawingViewMode(): [DrawingViewMode, (next: DrawingViewMode) => void] {
  const [mode, setMode] = useState<DrawingViewMode>('comfortable');

  // Hydrate after mount to avoid SSR mismatch.
  useEffect(() => {
    setMode(readInitial());
  }, []);

  const update = useCallback((next: DrawingViewMode) => {
    setMode(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return [mode, update];
}
