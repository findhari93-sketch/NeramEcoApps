/**
 * How long a pad screen waits before it asks for a snapshot again on its own.
 *
 * Realtime hints are the fast path. Polling is the safety net, and while the
 * Cloudflare proxy refuses WebSocket upgrades it is the only path, so its
 * cadence is what a class actually feels. It is tuned to what each screen needs
 * to feel live, and slowed hard wherever nobody is looking, because every poll
 * is a serverless invocation.
 */

export type RealtimeState = 'connecting' | 'subscribed' | 'unavailable';

export interface PollInputs {
  role: 'teacher' | 'student';
  realtime: RealtimeState;
  sessionStatus: 'live' | 'ended' | null;
  promptState: 'open' | 'closed' | 'revealed' | null;
  /** The tab or panel is not visible. */
  hidden: boolean;
  /** Consecutive failed fetches. */
  failures: number;
}

const HIDDEN_MS = 60_000;
const SUBSCRIBED_MS = 30_000;
/** The live counter while students are answering. */
const TEACHER_OPEN_MS = 2_000;
const TEACHER_IDLE_MS = 5_000;
/** A student must see OPEN within a few seconds of ASK. */
const STUDENT_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

/** Milliseconds until the next poll, or null to stop polling. */
export function nextPollDelay(inputs: PollInputs): number | null {
  if (inputs.sessionStatus === 'ended') return null;

  let delay: number;
  if (inputs.hidden) delay = HIDDEN_MS;
  else if (inputs.realtime === 'subscribed') delay = SUBSCRIBED_MS;
  else if (inputs.role === 'teacher') delay = inputs.promptState === 'open' ? TEACHER_OPEN_MS : TEACHER_IDLE_MS;
  else delay = STUDENT_MS;

  if (inputs.failures > 0) {
    delay = Math.min(delay * 2 ** Math.min(inputs.failures, 5), Math.max(MAX_BACKOFF_MS, delay));
  }
  return delay;
}
