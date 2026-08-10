'use client';

import { useEffect, useRef } from 'react';

export interface VisibilityPollingOptions {
  /** Skip polling entirely (e.g. while signed out). Default: true */
  enabled?: boolean;
  /** Run the callback once as soon as polling starts. Default: true */
  immediate?: boolean;
}

/**
 * setInterval that stops while the tab is hidden and catches up on return.
 *
 * A background tab has nobody looking at it, so every poll it fires is a
 * function invocation nobody reads. This repo had roughly a dozen unguarded
 * pollers and exactly one that paused, which meant a signed-in tab left open
 * overnight kept billing until it was closed.
 *
 * The callback is held in a ref, so an inline arrow at the call site does not
 * restart the interval on every render. That failure mode is what made the
 * notification bell fire a request per render before it was fixed, so it is
 * guarded here by construction rather than left to each caller.
 *
 * @example
 * useVisibilityPolling(fetchBadgeCounts, 60000);
 */
export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: VisibilityPollingOptions = {}
): void {
  const { enabled = true, immediate = true } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      void callbackRef.current();
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(run, intervalMs);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      // Refetch on return: the value may have moved while away, and waiting out
      // the rest of the interval would show a stale number at the exact moment
      // somebody is looking at it.
      run();
      start();
    };

    if (document.visibilityState !== 'hidden') {
      if (immediate) run();
      start();
    }

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, immediate]);
}
