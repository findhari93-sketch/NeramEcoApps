'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_PREFIX = 'neram_dismissed_';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DismissedEntry {
  /** Content ID that was dismissed */
  id: string;
  /** Timestamp when dismissed */
  at: number;
}

function getStorageKey(contentType: string): string {
  return `${STORAGE_KEY_PREFIX}${contentType}`;
}

/** Check if a specific content item was dismissed within the last 24 hours */
function isDismissedInStorage(contentType: string, contentId: string): boolean {
  try {
    const raw = localStorage.getItem(getStorageKey(contentType));
    if (!raw) return false;
    const data = JSON.parse(raw) as DismissedEntry;
    return data.id === contentId && Date.now() - data.at < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

/** Mark a content item as dismissed with timestamp */
function markDismissedInStorage(contentType: string, contentId: string) {
  try {
    localStorage.setItem(
      getStorageKey(contentType),
      JSON.stringify({ id: contentId, at: Date.now() } satisfies DismissedEntry),
    );
  } catch {
    // localStorage not available
  }
}

/**
 * Hook for 24-hour persistent dismissal of marketing content.
 * Returns [isDismissed, dismiss] — call dismiss(contentId) to persist for 24h.
 */
export function useDismiss(
  contentType: string,
  contentId: string | null,
): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(false);

  // Check localStorage on mount / when contentId changes
  useEffect(() => {
    if (contentId && isDismissedInStorage(contentType, contentId)) {
      setDismissed(true);
    }
  }, [contentType, contentId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (contentId) {
      markDismissedInStorage(contentType, contentId);
    }
  }, [contentType, contentId]);

  return [dismissed, dismiss];
}
