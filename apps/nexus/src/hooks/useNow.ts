'use client';

import { useEffect, useState } from 'react';

/**
 * A clock that re-renders the caller on an interval.
 *
 * Used by the timetable countdown and the live-class check. The default 15s
 * tick is deliberate: the countdown is rendered to the minute ("4h 12m"), so a
 * per-second timer would re-render the page sixty times to change nothing.
 *
 * Pass `active: false` once nothing on screen is time-sensitive (no upcoming or
 * live class) so an idle timetable is not re-rendering in the background.
 */
export function useNow(intervalMs: number = 15_000, active: boolean = true): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    // Tick immediately so a tab restored from background is not showing a
    // countdown frozen at whatever it was when the tab was hidden.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, active]);

  return now;
}
