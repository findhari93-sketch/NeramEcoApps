/**
 * How answers, keys and scores read on the pad screens. Plain words only: no
 * dashes as punctuation, a score shown as "3 of 4", and "No score yet" rather
 * than a zero percent before anything has been graded.
 */

import type { AnswerType, SkipReason, StudentScore } from './types';

/** "I can't answer": the reasons a student picks from, as the pad and the console word them. */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  dont_know: "I don't know",
  cant_see: "I can't see the question",
  need_time: 'I need more time',
  tech_problem: 'Technical problem',
  other: 'Something else',
};

/** The same reasons, short, for the teacher's one-line count. */
const SKIP_REASON_SHORT: Record<SkipReason, string> = {
  dont_know: "don't know",
  cant_see: "can't see it",
  need_time: 'need time',
  tech_problem: 'technical problem',
  other: 'other',
};

/** "3 can't answer: 2 don't know, 1 can't see it". Empty when nobody said. */
export function skipSummary(skips: { total: number; by_reason: Partial<Record<SkipReason, number>> } | null | undefined): string {
  if (!skips || skips.total <= 0) return '';
  const order = Object.keys(SKIP_REASON_LABELS) as SkipReason[];
  const parts = order
    .filter((reason) => (skips.by_reason[reason] ?? 0) > 0)
    .map((reason) => `${skips.by_reason[reason]} ${SKIP_REASON_SHORT[reason]}`);
  return `${skips.total} can't answer: ${parts.join(', ')}`;
}

export function displayAnswer(answerType: AnswerType, value: string): string {
  if (answerType === 'yesno') {
    if (value === 'yes') return 'Yes';
    if (value === 'no') return 'No';
  }
  return value;
}

/** "B", "A or C", "12, 12.5 or 13". Empty when there is no key. */
export function displayKeys(answerType: AnswerType, keys: readonly string[] | null | undefined): string {
  if (!keys || keys.length === 0) return '';
  const shown = keys.map((key) => displayAnswer(answerType, key));
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}`;
}

/**
 * What a question is called on every screen. The teacher's reference wins, so
 * the pad says what the paper on the shared screen says: "38" reads "Q.38",
 * anything else ("Paper 2 Q38", "Warm-up") reads as typed. With no reference it
 * falls back to the pad's own count, "Question 3".
 */
export function promptTitle(prompt: { sequence: number; label?: string | null }): string {
  const label = prompt.label?.trim();
  if (!label) return `Question ${prompt.sequence}`;
  return /^\d{1,4}[a-z]?$/i.test(label) ? `Q.${label}` : label;
}

/**
 * The reference the next question most likely has: the last number in the
 * previous one, plus one. "38" gives "39", "Q38" gives "Q39", "Paper 2 Q9"
 * gives "Paper 2 Q10". Empty when there is no number to count on.
 */
export function nextLabel(previous: string | null | undefined): string {
  const label = previous?.trim() ?? '';
  const match = /^(.*?)(\d+)(\D*)$/.exec(label);
  if (!match) return '';
  const [, head, digits, tail] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  // "38a" and "38 (i)" are parts of one question; the next question is 39.
  const partOfQuestion = /^([a-z]|\s*\(.*\))$/i.test(tail);
  return `${head}${next}${partOfQuestion ? '' : tail}`;
}

export function scoreLabel(score: StudentScore | null | undefined): string {
  if (!score || score.total_graded === 0) return 'No score yet';
  return `${score.correct} of ${score.total_graded}`;
}

export function answerTypeLabel(answerType: AnswerType, optionCount?: number | null): string {
  switch (answerType) {
    case 'mcq':
      return `A to ${'ABCDEF'.charAt(Math.min(Math.max((optionCount ?? 4) - 1, 1), 5))}`;
    case 'numeric':
      return 'Number';
    case 'text':
      return 'Short text';
    case 'yesno':
      return 'Yes or No';
  }
}
