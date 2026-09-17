/**
 * How answers, keys and scores read on the pad screens. Plain words only: no
 * dashes as punctuation, a score shown as "3 of 4", and "No score yet" rather
 * than a zero percent before anything has been graded.
 */

import type { AnswerType, StudentScore } from './types';

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
