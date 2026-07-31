/**
 * Turns a stream of raw player position ticks into two different numbers, which
 * are deliberately not the same thing:
 *
 *   position      where to drop the student back in ("Resume from 24:10").
 *   watchedDelta  how much of the video genuinely played.
 *
 * The distinction is the whole point. A student can drag the scrubber to the end
 * in one gesture, which moves `position` to the end while `watchedDelta` stays
 * at zero. Anything that gates on "have they watched it" has to read the second
 * number, or the gate is decorative.
 *
 * A tick gap larger than MAX_TICK_GAP_SECONDS is treated as a seek rather than
 * playback. Real ticks arrive roughly every 250ms from <video> timeupdate and
 * every 300ms from the YouTube poll, so 2 seconds is far above the noise floor
 * while still being well below any seek worth catching. A gap at or below zero
 * is a backward seek or a repeated tick while paused, and contributes nothing.
 *
 * `position` is a high-water mark for the session, so scrubbing backwards to
 * re-hear something never costs the student their resume point. It is seeded at
 * zero rather than from the stored value on purpose: after a failed class test
 * the server resets the stored position to force a rewatch, and seeding from the
 * old value would let the client immediately undo that reset.
 */

export const MAX_TICK_GAP_SECONDS = 2;

export interface WatchSnapshot {
  /** Highest position reached this session, in seconds. Never decreases. */
  position: number;
  /** Seconds of genuine playback accumulated since the last markFlushed(). */
  watchedDelta: number;
  /** Media duration in seconds as last reported, 0 while unknown. */
  duration: number;
}

export interface WatchAccumulator {
  /** Feed one player tick. Ignores non-finite and negative positions. */
  record(position: number, duration?: number): void;
  snapshot(): WatchSnapshot;
  /** Clears the accumulated delta only. Position and duration are retained. */
  markFlushed(): void;
  /** True when there is something worth sending. */
  hasPending(): boolean;
}

export function createWatchAccumulator(
  maxTickGapSeconds: number = MAX_TICK_GAP_SECONDS,
): WatchAccumulator {
  let lastPosition: number | null = null;
  let highWater = 0;
  let watchedDelta = 0;
  let duration = 0;
  // Position advanced since the last flush even if no full second of playback
  // accumulated, e.g. a seek. Still worth persisting as a resume point.
  let positionDirty = false;

  return {
    record(position: number, reportedDuration?: number): void {
      if (typeof reportedDuration === 'number' && Number.isFinite(reportedDuration) && reportedDuration > 0) {
        duration = reportedDuration;
      }
      if (!Number.isFinite(position) || position < 0) return;

      if (lastPosition !== null) {
        const gap = position - lastPosition;
        if (gap > 0 && gap <= maxTickGapSeconds) watchedDelta += gap;
      }
      lastPosition = position;

      if (position > highWater) {
        highWater = position;
        positionDirty = true;
      }
    },

    snapshot(): WatchSnapshot {
      return { position: highWater, watchedDelta, duration };
    },

    markFlushed(): void {
      watchedDelta = 0;
      positionDirty = false;
    },

    hasPending(): boolean {
      return watchedDelta > 0 || positionDirty;
    },
  };
}
