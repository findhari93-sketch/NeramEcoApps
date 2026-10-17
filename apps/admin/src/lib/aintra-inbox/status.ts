/**
 * Review status of one turn, and of a conversation (its worst turn).
 *
 *   error      no answer was delivered (credits ran out, or another failure)
 *   review     staff marked it wrong, or the saved AI Review says wrong / needs a fix
 *   none       nobody has looked yet
 *   corrected  staff saved a better answer
 *   resolved   staff marked it dealt with, no answer needed (for example a credits outage)
 *   gated      a returning guest was asked to sign in before Aintra answered
 *   ok         staff marked it a good answer
 *
 * A saved correction wins over everything: the person has been answered.
 * Resolved comes next, so a resolved failure leaves the Review queue.
 */
import type { AiVerdict, TurnStatus } from './types';

export const STATUS_RANK: Record<TurnStatus, number> = { error: 6, review: 5, none: 4, corrected: 3, resolved: 2, gated: 1, ok: 0 };

/** How a credits-ran-out failure is logged, old and new forms. */
export function isCreditsError(error: string | null | undefined): boolean {
  return !!error && (error.includes('CREDITS_DEPLETED') || error.includes('Gemini API error: 402') || error.startsWith('AI_BLOCKED'));
}

/** Logged by the site chat when a returning guest must sign in first. Not a failure. */
export const SIGNUP_GATE_ERROR = 'SIGNUP_REQUIRED';

export function isSignupGate(error: string | null | undefined): boolean {
  return error === SIGNUP_GATE_ERROR;
}

export function errorLabel(error: string | null | undefined): string {
  if (!error) return '';
  if (isSignupGate(error)) return 'asked to sign in first';
  if (isCreditsError(error)) return 'credits ran out';
  if (error.includes('TRUNCATED')) return 'the answer was cut off';
  if (error.includes('STREAM_INTERRUPTED')) return 'the connection dropped';
  return 'the AI failed';
}

export function turnStatus(t: {
  error: string | null;
  thumbs_up: boolean | null;
  has_correction: boolean;
  ai_verdict: AiVerdict | null;
  resolved?: boolean;
}): TurnStatus {
  if (t.has_correction) return 'corrected';
  if (t.resolved) return 'resolved';
  if (isSignupGate(t.error)) return 'gated';
  if (t.error) return 'error';
  if (t.thumbs_up === false) return 'review';
  if (t.thumbs_up === true) return 'ok';
  if (t.ai_verdict === 'wrong' || t.ai_verdict === 'needs_fix') return 'review';
  return 'none';
}

export function worstStatus(statuses: TurnStatus[]): TurnStatus {
  let worst: TurnStatus = 'ok';
  for (const s of statuses) if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  return statuses.length ? worst : 'none';
}

/** Review queue window: the sidebar badge and the header button count the same questions. */
export const REVIEW_QUEUE_DAYS = 30;

/** In the Review queue: answered badly or not answered, and nobody has fixed it yet. */
export function inReviewQueue(status: TurnStatus): boolean {
  return status === 'review' || status === 'error';
}
