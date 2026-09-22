/**
 * What the student pad shows, decided from the snapshot and the one answer the
 * pad may be sending. Pure, so every state in the side-panel spec (section 12)
 * is a unit test rather than a manual check.
 */

import { promptTitle } from './format';
import type { StudentPrompt, StudentSnapshot } from './types';

/** The answer the pad is sending, or failed to send, for one prompt. */
export interface PendingSubmit {
  promptId: string;
  answer: string;
  /** sending: first attempt; retrying: the network dropped, still trying; refused: the prompt closed first. */
  status: 'sending' | 'retrying' | 'refused';
}

export type MissedReason = 'closed-before-arrival' | 'joined-after-close' | 'did-not-answer';

export type StudentView =
  | { kind: 'loading' }
  | { kind: 'ended' }
  | { kind: 'idle'; classroomName: string | null }
  | { kind: 'answering'; prompt: StudentPrompt }
  | { kind: 'locking'; prompt: StudentPrompt; answer: string; retrying: boolean }
  | { kind: 'locked'; prompt: StudentPrompt; answer: string; closed: boolean }
  | { kind: 'missed'; prompt: StudentPrompt; reason: MissedReason; revealed: boolean }
  | { kind: 'result'; prompt: StudentPrompt; answer: string; outcome: 'correct' | 'incorrect' | 'poll' };

function missedReason(promptId: string, pending: PendingSubmit | null, seenOpen: ReadonlySet<string>): MissedReason {
  if (pending?.status === 'refused') return 'closed-before-arrival';
  if (!seenOpen.has(promptId)) return 'joined-after-close';
  return 'did-not-answer';
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
  if (snapshot.session.status === 'ended') return { kind: 'ended' };

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

  // The server's locked answer always wins over anything the pad is still sending.
  if (mine) return { kind: 'locked', prompt, answer: mine.answer, closed: prompt.state === 'closed' };

  if (pendingHere && pendingHere.status !== 'refused') {
    return { kind: 'locking', prompt, answer: pendingHere.answer, retrying: pendingHere.status === 'retrying' };
  }

  if (prompt.state === 'open') return { kind: 'answering', prompt };

  return { kind: 'missed', prompt, reason: missedReason(prompt.id, pendingHere, seenOpen), revealed: false };
}

/** What a screen reader says when the pad changes state. */
export function studentAnnouncement(view: StudentView): string {
  switch (view.kind) {
    case 'loading':
      return 'Connecting to your class.';
    case 'ended':
      return 'This class has ended.';
    case 'idle':
      return 'Connected. Waiting for a question.';
    case 'answering':
      return `${promptTitle(view.prompt)} is open.`;
    case 'locking':
      return view.retrying ? 'Still trying to lock your answer.' : 'Locking your answer.';
    case 'locked':
      return view.closed ? 'Your answer is locked. Answering has closed.' : 'Your answer is locked.';
    case 'missed':
      return view.revealed ? `${promptTitle(view.prompt)} was revealed.` : `${promptTitle(view.prompt)} has closed.`;
    case 'result':
      if (view.outcome === 'correct') return 'Correct.';
      if (view.outcome === 'incorrect') return 'Not this time.';
      return 'Thanks for answering. This one was a poll.';
  }
}
