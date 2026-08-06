'use client';

import { useEffect, useRef, useState } from 'react';
import { mergeRanges, rangesDiffer, type TimeRange } from '../format';
import type { VideoTransport } from '../types';

/**
 * What has downloaded, polled rather than pushed.
 *
 * Polled because neither surface can push it: `progress` on a <video> fires at
 * the browser's discretion and not at all once a range stops growing, and the
 * YouTube path has no event of any kind. One interval covers both.
 *
 * The throttle is the point. Reading buffered on every tick and setting state
 * unconditionally would hand the control bar a fresh array four times a second
 * and re-render every control in it for a bar whose pixels have not moved.
 */

const POLL_MS = 1000;

export default function useBuffered(
  transportRef: React.MutableRefObject<VideoTransport | null>,
  enabled: boolean,
): TimeRange[] {
  const [ranges, setRanges] = useState<TimeRange[]>([]);
  const rangesRef = useRef<TimeRange[]>(ranges);
  rangesRef.current = ranges;

  useEffect(() => {
    if (!enabled) return;
    const read = () => {
      const next = mergeRanges(transportRef.current?.getBuffered() ?? []);
      if (rangesDiffer(rangesRef.current, next)) setRanges(next);
    };
    read();
    const id = setInterval(read, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, transportRef]);

  return ranges;
}
