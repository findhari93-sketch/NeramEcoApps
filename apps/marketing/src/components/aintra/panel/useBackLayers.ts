'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Makes the phone's Back button close Aintra's layers instead of leaving the page.
 *
 * `depth` is how many layers are open (chat = 1, chat + canvas = 2). One history
 * entry is pushed per layer. Back pops one and calls onBack, which closes the top
 * layer. Closing a layer from the UI (the X or "Back to chat") takes its entry
 * back off, so the history never fills with dead entries.
 *
 * The entries copy the current history.state, because the Next.js App Router
 * keeps its own data there and a bare pushState would confuse it.
 *
 * Returns forget(): call it when the visitor navigates away through a link in
 * the chat, so the entries left behind are not unwound on the new page.
 */
export function useBackLayers(depth: number, onBack: () => void) {
  const pushed = useRef(0);
  /** popstates we caused ourselves with history.go, which are not a Back press. */
  const selfPops = useRef(0);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const onPop = () => {
      if (selfPops.current > 0) {
        selfPops.current -= 1;
        return;
      }
      if (pushed.current === 0) return;
      pushed.current -= 1;
      onBackRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    while (pushed.current < depth) {
      window.history.pushState({ ...(window.history.state ?? {}), aintraLayer: pushed.current + 1 }, '');
      pushed.current += 1;
    }
    if (pushed.current > depth) {
      const extra = pushed.current - depth;
      pushed.current = depth;
      selfPops.current += 1;
      window.history.go(-extra);
    }
  }, [depth]);

  return useCallback(() => {
    pushed.current = 0;
  }, []);
}
