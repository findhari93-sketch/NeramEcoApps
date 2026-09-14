/**
 * A smooth clock for replaying strokes against an <audio> element.
 *
 * `audio.currentTime` is not a smooth value. Browsers move it in steps (often
 * every 20 to 250ms, depending on the decoder and the platform), so a replay
 * that reads it straight draws a quick stroke in two or three jumps and looks
 * behind the voice. Between steps this extrapolates with the wall clock at the
 * playback rate, and re-anchors whenever the element reports a new time.
 *
 * Two rules keep it honest:
 *  - It never runs backwards by a small amount. A fresh sample that lands a few
 *    ms behind the extrapolation is the element catching up, not the audio
 *    rewinding, and un-drawing a point for one frame reads as flicker.
 *  - A real jump (a scrub, a seek, a stall) snaps straight to the element.
 *
 * Pure, so the timing rules can be tested without a browser.
 */

export interface ClockState {
  /** The last `currentTime` the element reported, in ms. */
  audioMs: number;
  /** performance.now() at which that value was taken as the anchor. */
  anchoredAt: number;
  /** The time last handed to the painter, in ms. */
  outMs: number;
}

export interface ClockInput {
  audioMs: number;
  now: number;
  rate: number;
  playing: boolean;
  durationMs: number;
}

/** A sample this far behind the extrapolation is treated as catching up. */
export const CATCH_UP_TOLERANCE_MS = 150;

/**
 * How far the clock may run on without the element moving. Past this the audio
 * is buffering or stalled, and strokes must wait for the voice.
 */
export const MAX_EXTRAPOLATION_MS = 300;

function clampTo(ms: number, durationMs: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return durationMs > 0 ? Math.min(ms, durationMs) : ms;
}

export function advanceClock(prev: ClockState | null, input: ClockInput): ClockState {
  const { audioMs, now, rate, playing, durationMs } = input;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;

  if (!prev || !playing) {
    const at = clampTo(audioMs, durationMs);
    return { audioMs, anchoredAt: now, outMs: at };
  }

  if (audioMs !== prev.audioMs) {
    const behind = prev.outMs - audioMs;
    if (behind > 0 && behind <= CATCH_UP_TOLERANCE_MS) {
      // Anchor so the extrapolation continues from where the painter already is.
      return { audioMs, anchoredAt: now - behind / safeRate, outMs: prev.outMs };
    }
    return { audioMs, anchoredAt: now, outMs: clampTo(audioMs, durationMs) };
  }

  const ahead = Math.min((now - prev.anchoredAt) * safeRate, MAX_EXTRAPOLATION_MS * safeRate);
  const estimate = clampTo(prev.audioMs + Math.max(0, ahead), durationMs);
  return { ...prev, outMs: Math.max(prev.outMs, estimate) };
}
