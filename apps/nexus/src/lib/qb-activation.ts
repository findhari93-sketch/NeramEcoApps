import { needsAnswerKey, parsedQuestionStatus, type QBQuestionStatus } from '@neram/database';

/** The only two fields that decide whether a question may go live. */
export interface ActivationCandidate {
  question_format: string | null;
  correct_answer: string | null;
}

/** An empty string is not a key: prod holds 410 draft rows whose answer is ''. */
function hasAnswerKey(answer: string | null | undefined): boolean {
  return typeof answer === 'string' && answer.trim() !== '';
}

/**
 * Whether a question can be shown to students.
 *
 * Read from the answer itself, never from `status`. Activate used to take only
 * rows whose status was answer_keyed, complete or active, and `status` drifts:
 * the edit form wrote `correct_answer` without moving the status along (see
 * statusAfterAnswerSave). JEE Paper 2 2007 Q76 and Q77 were keyed that way.
 * Activate updated nothing, and the toast told the teacher they had no answer
 * key when both did.
 *
 * A format with no key to wait for (a drawing) is always ready, matching
 * parsedQuestionStatus.
 */
export function canActivateQuestion(question: ActivationCandidate): boolean {
  if (!needsAnswerKey(question.question_format)) return true;
  return hasAnswerKey(question.correct_answer);
}

/**
 * The status a single-question save should leave behind, or null to leave it.
 *
 * Only a save that sends `correct_answer` moves anything, and only between
 * draft and keyed: a key arriving on a draft lifts it, a key cleared drops it
 * back. A corrected key keeps 'complete', and a live question is never touched
 * here. Same rule the paper JSON import applies in qb-paper-io.
 */
export function statusAfterAnswerSave(
  current: ActivationCandidate & { status: string | null },
  changes: Partial<ActivationCandidate>,
): QBQuestionStatus | null {
  if (!('correct_answer' in changes) || current.status === 'active') return null;
  const format = 'question_format' in changes ? changes.question_format ?? null : current.question_format;
  const next = parsedQuestionStatus(format, hasAnswerKey(changes.correct_answer));
  if (next === 'draft') return current.status === 'draft' ? null : 'draft';
  return current.status === 'draft' ? next : null;
}

export function splitForActivation<T extends ActivationCandidate>(
  questions: T[],
): { ready: T[]; blocked: T[] } {
  const ready: T[] = [];
  const blocked: T[] = [];
  for (const q of questions) (canActivateQuestion(q) ? ready : blocked).push(q);
  return { ready, blocked };
}

/**
 * The toast after Activate or Deactivate.
 *
 * A shortfall is only blamed on the answer key when the server says that is
 * what held rows back. Any other gap (a row deleted since the list loaded) is
 * reported as what it is, so the teacher is not sent to fix the wrong thing.
 */
export function activationMessage({
  active,
  requested,
  updated,
  blocked,
}: {
  active: boolean;
  requested: number;
  updated: number;
  blocked: number;
}): string {
  const plural = (n: number) => `${n} question${n === 1 ? '' : 's'}`;
  if (!active) return `${plural(updated)} hidden from students`;
  if (updated === requested) return `${plural(updated)} activated`;
  if (updated === 0 && blocked > 0) return 'Not activated. Add the correct answer first.';
  if (blocked > 0) {
    return `${updated} of ${requested} activated. ${blocked} still need${blocked === 1 ? 's' : ''} an answer key.`;
  }
  return `${updated} of ${requested} activated. Refresh and try again.`;
}
