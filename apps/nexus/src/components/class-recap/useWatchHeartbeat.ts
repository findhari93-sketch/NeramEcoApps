'use client';

import useVideoProgress, {
  type VideoProgressHeartbeat,
} from '@/components/video/useVideoProgress';

/**
 * Recap-shaped wrapper over the shared watch heartbeat.
 *
 * The implementation moved to components/video/useVideoProgress once Foundation
 * chapter tracks needed the same behaviour against a different route. Everything
 * that was interesting about this hook (the accumulator, the 10 second cadence,
 * the keepalive unload flush that keeps a Microsoft token out of a query string)
 * lives there now and is written once. All that is left here is the URL.
 */

interface UseWatchHeartbeatOptions {
  recapId: string;
  /** Microsoft access token. The hook stays idle until this is non-null. */
  token: string | null;
  /** Set false to stop persisting, e.g. once the recap is fully completed. */
  enabled?: boolean;
}

export function useWatchHeartbeat({
  recapId,
  token,
  enabled = true,
}: UseWatchHeartbeatOptions): VideoProgressHeartbeat {
  return useVideoProgress({
    endpoint: recapId ? `/api/student/class-recaps/${recapId}/progress` : null,
    token,
    enabled,
  });
}

export default useWatchHeartbeat;
