'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A view/density preference kept in localStorage.
 *
 * The generic version of the one-off in `useDrawingViewMode`, and of the
 * copy-pasted restore effect on the students roster and the study-materials
 * pages. Same three rules every time:
 *
 * 1. Render the default on the first pass. Reading localStorage during render
 *    gives the server and the client different markup, which React reports as a
 *    hydration mismatch and then discards the whole tree.
 * 2. Validate what comes back. A stored value can be from an older build whose
 *    modes no longer exist, and setting state to it would render nothing.
 * 3. Never let storage throw. Private browsing and a full quota both raise, and
 *    a preference is not worth a blank page.
 *
 * Keys follow `nexus:<surface>:<setting>`.
 */
export function useStoredViewMode<T extends string>(
  storageKey: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [mode, setMode] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && (allowed as readonly string[]).includes(stored)) {
        setMode(stored as T);
      }
    } catch {
      /* localStorage unavailable, keep the default */
    }
    // `allowed` is a module-level constant at every call site, so it is stable
    // in practice; the key is what identifies this preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = useCallback(
    (next: T) => {
      setMode(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* non-fatal: the choice still applies for this session */
      }
    },
    [storageKey],
  );

  return [mode, update];
}
