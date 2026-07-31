'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createWatchAccumulator } from '@/lib/watch-progress';

/**
 * Persists recap watch progress so a student can leave and come back.
 *
 * Nothing wrote nexus_class_recap_progress.last_video_position_seconds before
 * this hook existed: RecapPlayer accepted an onTimeUpdate prop that the page
 * never passed, so the column sat at 0 forever. That had two consequences worth
 * naming, because both looked like unrelated bugs from the outside. There was no
 * resume, so closing the tab on a phone lost the whole watch. And rearmCatchupTest
 * gates on having watched at least 90% of the duration, so the "Unlock my test"
 * button after a failed class test could never succeed.
 *
 * Flush cadence is a compromise between losing progress and spending Vercel
 * function invocations. Every 10 seconds of playback is roughly 9 writes for a
 * 90 minute class, which is nothing, and caps the worst-case loss at 10 seconds.
 *
 * The unload flush uses fetch with keepalive rather than navigator.sendBeacon.
 * sendBeacon cannot set headers, which is why the progress route also accepts
 * the access token as a ?token= query parameter, and a Microsoft access token in
 * a URL ends up in access logs, proxy logs and the Referer of anything the page
 * loads afterwards. keepalive survives unload the same way and carries a normal
 * Authorization header, so that query parameter stays unused here.
 */

const FLUSH_INTERVAL_MS = 10_000;

interface UseWatchHeartbeatOptions {
  recapId: string;
  /** Microsoft access token. The hook stays idle until this is non-null. */
  token: string | null;
  /** Set false to stop persisting, e.g. once the recap is fully completed. */
  enabled?: boolean;
}

interface WatchHeartbeat {
  /** Hand this straight to RecapPlayer's onTimeUpdate. */
  onTick: (seconds: number, duration: number) => void;
  /** Force a write now. Call on pause and after a checkpoint is passed. */
  flushNow: () => void;
}

export function useWatchHeartbeat({
  recapId,
  token,
  enabled = true,
}: UseWatchHeartbeatOptions): WatchHeartbeat {
  const accumulatorRef = useRef(createWatchAccumulator());
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Guards against a slow request overlapping the next interval tick, which
  // would double-count nothing but would queue writes behind each other.
  const inFlightRef = useRef(false);

  const flush = useCallback(
    (useKeepalive: boolean) => {
      const accumulator = accumulatorRef.current;
      const authToken = tokenRef.current;
      if (!enabledRef.current || !authToken || !recapId) return;
      if (!accumulator.hasPending()) return;
      if (inFlightRef.current && !useKeepalive) return;

      const { position, watchedDelta, duration } = accumulator.snapshot();
      // Cleared optimistically. Losing one flush costs at most a few seconds of
      // resume accuracy, whereas holding the delta until a response arrives
      // would double-count it against the next flush on a slow connection.
      accumulator.markFlushed();
      inFlightRef.current = true;

      void fetch(`/api/student/class-recaps/${recapId}/progress`, {
        method: 'POST',
        keepalive: useKeepalive,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          last_video_position_seconds: Math.round(position),
          watched_delta_seconds: Math.round(watchedDelta),
          duration_seconds: Math.round(duration),
        }),
      })
        .catch(() => {
          // Offline or unloading. The next tick re-dirties the accumulator, so
          // there is nothing useful to do here and nothing worth alarming the
          // student about.
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    },
    [recapId],
  );

  const onTick = useCallback((seconds: number, duration: number) => {
    accumulatorRef.current.record(seconds, duration);
  }, []);

  const flushNow = useCallback(() => flush(false), [flush]);

  // Periodic flush while the page is open.
  useEffect(() => {
    const id = setInterval(() => flush(false), FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Save on the way out. visibilitychange covers tab switch, minimise, phone
  // lock and app switch, which is what actually happens on a phone; pagehide
  // covers real navigation away. window.blur is deliberately not used: it also
  // fires when a modal takes focus or devtools opens.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => flush(true);

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      // Unmounting is itself a departure, e.g. routing to the class test.
      flush(true);
    };
  }, [flush]);

  return { onTick, flushNow };
}

export default useWatchHeartbeat;
