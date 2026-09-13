'use client';

/**
 * The AI draft for the drawing on screen, or null. Reads only.
 *
 * Null is the everyday answer: drafts exist only after evaluation is switched
 * on and someone presses Draft this. Every surface that takes a draft renders
 * exactly as before when it is null.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiDraft } from '@/lib/drawing-ai-draft';

export function useAiDraft(submissionId: string | null, getToken: () => Promise<string | null>) {
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [version, setVersion] = useState(0);
  // getToken is a fresh function every render; see RubricScorePanel.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  useEffect(() => {
    if (!submissionId) { setDraft(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        const res = await fetch(`/api/drawing/submissions/${submissionId}/ai-draft`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setDraft(body.draft ?? null);
      } catch {
        // No draft is a valid state.
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { draft, reload };
}
