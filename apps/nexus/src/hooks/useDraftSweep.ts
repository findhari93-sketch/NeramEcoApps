'use client';

/**
 * Draft whatever is still waiting without an AI draft, at most once every ten
 * minutes per browser tab.
 *
 * The Drawing Reviews queue used to fire this each time it opened. With the
 * queue retired, the Sketchbooks page and an assignment's page call it instead.
 * Fired and forgotten: a failure only leaves those sheets for the next sweep or
 * a hand review.
 */

import { useEffect } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const KEY = 'nexus:drawing-sweep-at';
export const SWEEP_EVERY_MS = 10 * 60 * 1000;

export function shouldSweep(now: number, last: string | null): boolean {
  const at = last == null ? NaN : Number(last);
  return !Number.isFinite(at) || now - at >= SWEEP_EVERY_MS;
}

export function useDraftSweep(): void {
  const { getToken, tokenReady } = useNexusAuthContext();
  useEffect(() => {
    if (!tokenReady) return;
    let last: string | null = null;
    try { last = sessionStorage.getItem(KEY); } catch { /* storage blocked */ }
    if (!shouldSweep(Date.now(), last)) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await fetch('/api/drawing/evaluations/sweep', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {
        // Ignored on purpose, see above.
      }
    })();
  }, [tokenReady, getToken]);
}
