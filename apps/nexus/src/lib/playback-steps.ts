/**
 * Decides whether a step of the playhead was the video playing or a jump.
 *
 * The rule this replaces looked at media time alone: a step of more than two
 * seconds between two ticks was a seek, so it counted for nothing. That is
 * right for a drag and wrong for everything else that makes ticks arrive late:
 * a phone busy drawing the page, a throttled background poll, a laptop that
 * hitched. Each of those threw away real playback, and the same rule fed the
 * 80% quiz gate, so a student on a weak device watched a section in full, was
 * told they had watched 70% of it, and was sent back again (Inaya, 2026-10-12:
 * 86 minutes on a 14 minute section, 778 seconds credited).
 *
 * The question that actually separates the two is whether real time passed. A
 * video playing at rate r for w seconds moves about r * w seconds. A seek moves
 * the playhead with no time passing at all. So a step counts as played when
 * the media moved no further than the wall clock allows at the current rate,
 * with slack for timer jitter, and as a jump otherwise. Anything around a
 * seek, a pause, a reload or a stall is not a step at all.
 *
 * performance.now() rather than Date.now(): a phone that corrects its clock
 * mid-video must not look like an hour of playback.
 */

export interface PlaybackSample {
  /** Media position in seconds. */
  t: number;
  /** Monotonic wall clock in milliseconds (performance.now()). */
  wall: number;
  /** The video was playing (not paused) when this sample was taken. */
  playing: boolean;
  /** Playback rate at this sample. */
  rate: number;
}

export type PlaybackStep =
  | { kind: 'played'; from: number; to: number }
  | { kind: 'discarded'; seconds: number }
  | { kind: 'none' };

/** Allowance over rate x wall time, for tick and decode jitter. */
const RATE_SLACK = 1.25;
const JITTER_SECONDS = 0.75;
/**
 * No single step is credited beyond this, however long the gap. A tab that was
 * frozen for minutes and resumed is better re-measured than trusted.
 */
const MAX_STEP_SECONDS = 120;
/** Below this a rate reading is noise, not a slow-motion student. */
const MIN_RATE = 0.25;

export interface StepClassifier {
  observe(sample: PlaybackSample): PlaybackStep;
  /** The next sample starts afresh: a seek, a clamp, a reload, a resume. */
  markDiscontinuity(): void;
}

export function createStepClassifier(): StepClassifier {
  let prev: PlaybackSample | null = null;
  let broken = true;

  return {
    observe(sample) {
      if (!Number.isFinite(sample.t) || sample.t < 0 || !Number.isFinite(sample.wall)) {
        return { kind: 'none' };
      }
      const last = prev;
      prev = sample;
      if (!last || broken || !last.playing || !sample.playing) {
        broken = false;
        return { kind: 'none' };
      }

      const dm = sample.t - last.t;
      if (dm <= 0) return { kind: 'none' };

      const dw = Math.max(0, (sample.wall - last.wall) / 1000);
      const rate = Math.max(last.rate || 1, sample.rate || 1, MIN_RATE);
      if (dm > MAX_STEP_SECONDS || dm > dw * rate * RATE_SLACK + JITTER_SECONDS) {
        return { kind: 'discarded', seconds: dm };
      }
      return { kind: 'played', from: last.t, to: sample.t };
    },

    markDiscontinuity() {
      broken = true;
    },
  };
}
