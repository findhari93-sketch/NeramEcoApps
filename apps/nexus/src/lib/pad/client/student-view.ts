/**
 * What the student pad shows, decided from the snapshot and the one answer the
 * pad may be sending. Pure, so every state in the side-panel spec (section 12)
 * is a unit test rather than a manual check.
 *
 * An answer is SELECTED, not locked: while the question is open the student can
 * pick another option and the newest one is saved. It locks when the teacher
 * closes answers, and from then on the server's answer is the one shown.
 */

import { shownAnswer } from '../formula-answer';
import { displayAnswer, promptTitle } from './format';
import type { QBQuestionView, StudentPrompt, StudentSnapshot } from './types';

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
  /** Refused only: the server said the question's time ran out (409 with time_up). */
  timeUp?: boolean;
  /**
   * Refused only: the prompt's version when the refusal came. A snapshot that
   * shows it OPEN at a newer version means the teacher reopened it (Reopen, or
   * +15s on a question whose time was up), and the refusal no longer applies.
   */
  version?: number;
}

export type MissedReason = 'closed-before-arrival' | 'joined-after-close' | 'did-not-answer' | 'time-up';

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
  /** Closed with an answer that stands. timeUp: it closed because the timer ran out. */
  | { kind: 'locked'; prompt: StudentPrompt; answer: string; timeUp?: boolean }
  | { kind: 'missed'; prompt: StudentPrompt; reason: MissedReason; revealed: boolean }
  | { kind: 'result'; prompt: StudentPrompt; answer: string; outcome: 'correct' | 'incorrect' | 'poll' };

function missedReason(promptId: string, pending: PendingSubmit | null, seenOpen: ReadonlySet<string>, timeUp = false): MissedReason {
  if (pending?.status === 'refused') return pending.timeUp ? 'time-up' : 'closed-before-arrival';
  if (timeUp && seenOpen.has(promptId)) return 'time-up';
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
 * Whether a timed question's time has run out on the server's clock. The
 * snapshot may still say OPEN for a moment (the presenter or the next read
 * closes it), so the pad locks on its own at 0.
 */
export function isTimeUp(prompt: Pick<StudentPrompt, 'closes_at'> | null | undefined, serverNow: number | null | undefined): boolean {
  if (!prompt?.closes_at || serverNow === null || serverNow === undefined) return false;
  const closesAt = Date.parse(prompt.closes_at);
  return Number.isFinite(closesAt) && closesAt <= serverNow;
}

/** Longest option text that may sit under the letter on an answer button. */
const BUTTON_TEXT_MAX = 60;

/** An option's text as plain words short enough for a button, or null (math, long, or a figure). */
function buttonText(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  if (!trimmed || trimmed.length >= BUTTON_TEXT_MAX || trimmed.includes('$') || trimmed.includes('\\')) return null;
  return trimmed;
}

/**
 * The words on each answer button for a question bank question: short plain
 * option texts only, so a button never needs KaTeX. Null when none qualifies,
 * and the buttons show letters alone.
 */
export function qbButtonTexts(qb: Pick<QBQuestionView, 'options'> | null | undefined): Array<string | null> | null {
  if (!qb?.options?.length) return null;
  const texts = qb.options.map((option) => buttonText(option.text));
  return texts.some((text) => text) ? texts : null;
}

/**
 * @param seenOpen prompt ids this pad has shown while OPEN, which is how "you
 *   joined after it closed" is told apart from "you didn't answer".
 * @param serverNow the server's clock now (useServerNow), for a timed question.
 */
export function deriveStudentView(
  snapshot: StudentSnapshot | null,
  pending: PendingSubmit | null,
  seenOpen: ReadonlySet<string>,
  serverNow?: number | null,
): StudentView {
  if (!snapshot) return { kind: 'loading' };
  if (snapshot.session.status === 'ended') {
    return { kind: 'ended', roundNo: snapshot.session.round_no ?? null, published: Boolean(snapshot.session.results_published_at) };
  }

  const prompt = snapshot.prompt;
  if (!prompt) return { kind: 'idle', classroomName: snapshot.session.classroom_name };

  const mine = snapshot.my_response;
  // A formula answer shows as the student wrote it ("2√3"), not as the value it is kept as.
  const mineShown = mine ? shownAnswer(prompt.answer_type, mine.answer, mine.raw_answer) : null;
  const timeUp = isTimeUp(prompt, serverNow);
  let pendingHere = pending && pending.promptId === prompt.id ? pending : null;
  // A refusal from before the teacher reopened the question (or added time) no longer applies.
  if (
    pendingHere?.status === 'refused' &&
    prompt.state === 'open' &&
    !timeUp &&
    pendingHere.version !== undefined &&
    prompt.version > pendingHere.version
  ) {
    pendingHere = null;
  }

  if (prompt.state === 'revealed') {
    if (mine) {
      const outcome = prompt.ungraded ? 'poll' : mine.is_correct ? 'correct' : 'incorrect';
      return { kind: 'result', prompt, answer: mineShown ?? mine.answer, outcome };
    }
    return { kind: 'missed', prompt, reason: missedReason(prompt.id, pendingHere, seenOpen), revealed: true };
  }

  // The server said the question closed and which answer stands, even if this
  // snapshot is a moment older and still says open.
  if (pendingHere?.status === 'refused' && pendingHere.standing) {
    return { kind: 'locked', prompt, answer: pendingHere.standing, ...(timeUp || pendingHere.timeUp ? { timeUp: true } : {}) };
  }

  if (prompt.state === 'open' && !timeUp) {
    // The answer being sent is the one the student just chose; once it lands
    // the pad drops it and the server's answer wins.
    if (pendingHere && pendingHere.status !== 'refused') {
      return { kind: 'answering', prompt, selected: pendingHere.answer, save: pendingHere.status };
    }
    return { kind: 'answering', prompt, selected: mineShown, save: mine ? 'saved' : null };
  }

  // Closed, or open with its time up. The server's answer always wins over
  // anything the pad is still sending; a tap made before 0 keeps trying, and the
  // server's two seconds of grace decide whether it counts.
  if (mine && !(pendingHere && pendingHere.status !== 'refused' && prompt.state === 'open')) {
    return { kind: 'locked', prompt, answer: mineShown ?? mine.answer, ...(timeUp ? { timeUp: true } : {}) };
  }

  if (pendingHere && pendingHere.status !== 'refused') {
    return { kind: 'saving', prompt, answer: pendingHere.answer, retrying: pendingHere.status === 'retrying' };
  }

  return { kind: 'missed', prompt, reason: missedReason(prompt.id, pendingHere, seenOpen, timeUp), revealed: false };
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
      if (view.timeUp) return `Time is up. Your answer ${displayAnswer(view.prompt.answer_type, view.answer)} is locked.`;
      return `Answering has closed. Your answer ${displayAnswer(view.prompt.answer_type, view.answer)} is locked.`;
    case 'missed':
      if (view.reason === 'time-up' && !view.revealed) return 'Time is up.';
      return view.revealed ? `${promptTitle(view.prompt)} was revealed.` : `${promptTitle(view.prompt)} has closed.`;
    case 'result':
      if (view.outcome === 'correct') return 'Correct.';
      if (view.outcome === 'incorrect') return 'Not this time.';
      return 'Thanks for answering. This one was a poll.';
  }
}
