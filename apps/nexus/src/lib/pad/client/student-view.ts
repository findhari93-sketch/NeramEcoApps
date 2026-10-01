/**
 * What the student pad shows, decided from the snapshot and the one answer the
 * pad may be sending. Pure, so every state in the side-panel spec (section 12)
 * is a unit test rather than a manual check.
 *
 * An answer is SELECTED, not locked: while the question is open the student can
 * pick another option and the newest one is saved. It locks when the teacher
 * closes answers, and from then on the server's answer is the one shown.
 */

import { displayAnswer, promptTitle } from './format';
import type { StudentPrompt, StudentSnapshot } from './types';

/** The answer the pad is sending, or failed to send, for one prompt. */
export interface PendingSubmit {
  promptId: string;
  answer: string;
  /** sending: first attempt; retrying: the network dropped, still trying; refused: the prompt closed first. */
  status: 'sending' | 'retrying' | 'refused';
  /**
   * Refused only: the answer that stands, when the server said so (a change
   * that arrived after Close). The pad shows it as locked, not as an error.
   */
  standing?: string | null;
}

export type MissedReason = 'closed-before-arrival' | 'joined-after-close' | 'did-not-answer';

/** Where the chosen answer is: on its way, still trying, or saved on the server. */
export type SaveState = 'sending' | 'retrying' | 'saved';

export type StudentView =
  | { kind: 'loading' }
  | { kind: 'ended'; roundNo: number | null; published: boolean }
  | { kind: 'idle'; classroomName: string | null }
  /** Open: the options stay live. `selected` is the answer shown as chosen, if any. */
  | { kind: 'answering'; prompt: StudentPrompt; selected: string | null; save: SaveState | null }
  /** Closed while the answer was still travelling: the server decides whether it landed in time. */
  | { kind: 'saving'; prompt: StudentPrompt; answer: string; retrying: boolean }
  /** Closed with an answer that stands. */
  | { kind: 'locked'; prompt: StudentPrompt; answer: string }
  | { kind: 'missed'; prompt: StudentPrompt; reason: MissedReason; revealed: boolean }
  | { kind: 'result'; prompt: StudentPrompt; answer: string; outcome: 'correct' | 'incorrect' | 'poll' };

function missedReason(promptId: string, pending: PendingSubmit | null, seenOpen: ReadonlySet<string>): MissedReason {
  if (pending?.status === 'refused') return 'closed-before-arrival';
  if (!seenOpen.has(promptId)) return 'joined-after-close';
  return 'did-not-answer';
}

/**
 * The round a new snapshot says the student should follow: the class moved on
 * to another round after this one ended. Null while this round runs.
 */
export function nextRoundId(snapshot: StudentSnapshot | null): string | null {
  if (!snapshot || snapshot.session.status !== 'ended') return null;
  const next = snapshot.session.next_session_id ?? null;
  return next && next !== snapshot.session.id ? next : null;
}

/**
 * @param seenOpen prompt ids this pad has shown while OPEN, which is how "you
 *   joined after it closed" is told apart from "you didn't answer".
 */
export function deriveStudentView(
  snapshot: StudentSnapshot | null,
  pending: PendingSubmit | null,
  seenOpen: ReadonlySet<string>,
): StudentView {
  if (!snapshot) return { kind: 'loading' };
  if (snapshot.session.status === 'ended') {
    return { kind: 'ended', roundNo: snapshot.session.round_no ?? null, published: Boolean(snapshot.session.results_published_at) };
  }

  const prompt = snapshot.prompt;
  if (!prompt) return { kind: 'idle', classroomName: snapshot.session.classroom_name };

  const mine = snapshot.my_response;
  const pendingHere = pending && pending.promptId === prompt.id ? pending : null;

  if (prompt.state === 'revealed') {
    if (mine) {
      const outcome = prompt.ungraded ? 'poll' : mine.is_correct ? 'correct' : 'incorrect';
      return { kind: 'result', prompt, answer: mine.answer, outcome };
    }
    return { kind: 'missed', prompt, reason: missedReason(prompt.id, pendingHere, seenOpen), revealed: true };
  }

  // The server said the question closed and which answer stands, even if this
  // snapshot is a moment older and still says open.
  if (pendingHere?.status === 'refused' && pendingHere.standing) {
    return { kind: 'locked', prompt, answer: pendingHere.standing };
  }

  if (prompt.state === 'open') {
    // The answer being sent is the one the student just chose; once it lands
    // the pad drops it and the server's answer wins.
    if (pendingHere && pendingHere.status !== 'refused') {
      return { kind: 'answering', prompt, selected: pendingHere.answer, save: pendingHere.status };
    }
    return { kind: 'answering', prompt, selected: mine?.answer ?? null, save: mine ? 'saved' : null };
  }

  // Closed. The server's answer always wins over anything the pad is still sending.
  if (mine) return { kind: 'locked', prompt, answer: mine.answer };

  if (pendingHere && pendingHere.status !== 'refused') {
    return { kind: 'saving', prompt, answer: pendingHere.answer, retrying: pendingHere.status === 'retrying' };
  }

  return { kind: 'missed', prompt, reason: missedReason(prompt.id, pendingHere, seenOpen), revealed: false };
}

/** What a screen reader says when the pad changes state. */
export function studentAnnouncement(view: StudentView): string {
  switch (view.kind) {
    case 'loading':
      return 'Connecting to your class.';
    case 'ended':
      return view.published ? 'This round has ended. Your result is ready.' : 'This round has ended.';
    case 'idle':
      return 'Connected. Waiting for a question.';
    case 'answering':
      if (view.save === 'sending') return 'Saving your answer.';
      if (view.save === 'retrying') return 'Still trying to save your answer.';
      if (view.save === 'saved' && view.selected) return `Your answer ${displayAnswer(view.prompt.answer_type, view.selected)} is saved.`;
      return `${promptTitle(view.prompt)} is open.`;
    case 'saving':
      return view.retrying ? 'Still trying to send your answer.' : 'Sending your answer.';
    case 'locked':
      return `Answering has closed. Your answer ${displayAnswer(view.prompt.answer_type, view.answer)} is locked.`;
    case 'missed':
      return view.revealed ? `${promptTitle(view.prompt)} was revealed.` : `${promptTitle(view.prompt)} has closed.`;
    case 'result':
      if (view.outcome === 'correct') return 'Correct.';
      if (view.outcome === 'incorrect') return 'Not this time.';
      return 'Thanks for answering. This one was a poll.';
  }
}
