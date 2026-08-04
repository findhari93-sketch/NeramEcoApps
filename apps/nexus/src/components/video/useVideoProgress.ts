'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createWatchAccumulator } from '@/lib/watch-progress';

/**
 * Persists watch progress for any gated video, so a student can leave and come
 * back. Recaps, Foundation chapter tracks, anything the shared player drives.
 *
 * This is useWatchHeartbeat with the recap URL lifted out. Nothing else about it
 * was recap-shaped: the accumulator, the cadence and the unload handling apply
 * to any video whose position we care about. The one thing a caller must supply
 * is where to POST, because each surface owns its own progress route and its own
 * idea of what a position means.
 *
 * Nothing wrote nexus_class_recap_progress.last_video_position_seconds before
 * this existed: RecapPlayer accepted an onTimeUpdate prop that the page never
 * passed, so the column sat at 0 forever. That had two consequences worth naming,
 * because both looked like unrelated bugs from the outside. There was no resume,
 * so closing the tab on a phone lost the whole watch. And rearmCatchupTest gates
 * on having watched at least 90% of the duration, so the "Unlock my test" button
 * after a failed class test could never succeed.
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

export interface UseVideoProgressOptions {
  /** Where to POST. Null keeps the hook idle, e.g. before the id is known. */
  endpoint: string | null;
  /** Microsoft access token. The hook stays idle until this is non-null. */
  token: string | null;
  /** Set false to stop persisting, e.g. once the video is fully completed. */
  enabled?: boolean;
}

export interface VideoProgressHeartbeat {
  /** Hand this straight to the player's onTimeUpdate. */
  onTick: (seconds: number, duration: number) => void;
  /**
   * Hand this to the player's onBlockedSeek. Counted rather than sent
   * immediately: a student dragging at a boundary produces a burst of these, and
   * one request each would be a write per mouse move.
   */
  onBlockedSeek: () => void;
  /** Force a write now. Call on pause and after a checkpoint is passed. */
  flushNow: () => void;
}

export function useVideoProgress({
  endpoint,
  token,
  enabled = true,
}: UseVideoProgressOptions): VideoProgressHeartbeat {
  const accumulatorRef = useRef(createWatchAccumulator());
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;
  // Guards against a slow request overlapping the next interval tick, which
  // would double-count nothing but would queue writes behind each other.
  const inFlightRef = useRef(false);
  const blockedRef = useRef(0);

  const flush = useCallback((useKeepalive: boolean) => {
    const accumulator = accumulatorRef.current;
    const authToken = tokenRef.current;
    const url = endpointRef.current;
    if (!enabledRef.current || !authToken || !url) return;
    // A burst of refused seeks with no playback still deserves a write: it is
    // the case a tutor most wants to see.
    if (!accumulator.hasPending() && blockedRef.current === 0) return;
    if (inFlightRef.current && !useKeepalive) return;

    const { position, watchedDelta, duration } = accumulator.snapshot();
    const blocked = blockedRef.current;
    // Cleared optimistically. Losing one flush costs at most a few seconds of
    // resume accuracy, whereas holding the delta until a response arrives would
    // double-count it against the next flush on a slow connection.
    accumulator.markFlushed();
    blockedRef.current = 0;
    inFlightRef.current = true;

    void fetch(url, {
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
        blocked_seeks_delta: blocked,
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
  }, []);

  const onTick = useCallback((seconds: number, duration: number) => {
    accumulatorRef.current.record(seconds, duration);
  }, []);

  const onBlockedSeek = useCallback(() => {
    blockedRef.current += 1;
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

  return { onTick, onBlockedSeek, flushNow };
}

export default useVideoProgress;
