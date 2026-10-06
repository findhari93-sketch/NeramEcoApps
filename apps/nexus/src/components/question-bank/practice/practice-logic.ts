/**
 * The practice screen's rules, kept out of React so each can be tested alone.
 *
 * PURE: no React.
 */

import type { QBAttemptSummary } from '@neram/database';
import { QB_CATEGORY_LABELS, type QBCategory } from '@neram/database';
import type { PracticeScope } from '@/lib/qb-paper-number';

/** Where a student stands on one question. Mirrors AttemptIndicator. */
export type QuestionStatus = 'unanswered' | 'right' | 'wrong';

export function statusOf(summary: QBAttemptSummary | null | undefined): QuestionStatus {
  if (!summary || summary.total_attempts === 0) return 'unanswered';
  return summary.last_was_correct ? 'right' : 'wrong';
}

/** Read aloud with the question number: "Question 18, answered wrong". */
export const STATUS_SPEECH: Record<QuestionStatus, string> = {
  unanswered: 'not answered yet',
  right: 'answered right',
  wrong: 'answered wrong',
};

/**
 * The summary after one more attempt, so the grid and the list change the
 * moment the answer lands instead of on the next refetch.
 */
export function patchAttemptSummary(
  summary: QBAttemptSummary | null | undefined,
  isCorrect: boolean,
  at: string,
): QBAttemptSummary {
  return {
    total_attempts: (summary?.total_attempts ?? 0) + 1,
    last_attempt_at: at,
    last_was_correct: isCorrect,
    best_result: (summary?.best_result ?? false) || isCorrect,
  };
}

export interface PracticeProgress {
  total: number;
  answered: number;
  right: number;
}

export function progressOf(items: { attempt_summary: QBAttemptSummary | null }[]): PracticeProgress {
  let answered = 0;
  let right = 0;
  for (const item of items) {
    const status = statusOf(item.attempt_summary);
    if (status !== 'unanswered') answered += 1;
    if (status === 'right') right += 1;
  }
  return { total: items.length, answered, right };
}

/** Where "Continue" takes the student: the first question they have not answered. */
export function firstUnanswered(items: { id: string; attempt_summary: QBAttemptSummary | null }[]): string | null {
  return items.find((item) => statusOf(item.attempt_summary) === 'unanswered')?.id ?? null;
}

/**
 * The header's jump button, or null when it would go nowhere new.
 *
 * Null when the target is the question already open: on a laptop Q1 opens in
 * the reader by itself, and a "Start" button that lands on the same question
 * looked dead. "Start at Q1" rather than "Start the paper", which read like
 * the timed sitting on the paper page.
 */
export function continueAction(args: {
  targetId: string | null;
  currentId: string | null;
  answered: number;
  scope: PracticeScope;
  number: string | null;
}): { id: string; label: string } | null {
  const { targetId, currentId, answered, scope, number } = args;
  if (!targetId || targetId === currentId) return null;
  if (answered > 0) return { id: targetId, label: `Continue at Q${number}` };
  if (scope === 'paper') return { id: targetId, label: `Start at Q${number}` };
  return null;
}

/** One step along the list, or null past either end. */
export function stepFrom(items: { id: string }[], currentId: string | null, delta: number): string | null {
  if (!currentId) return null;
  const idx = items.findIndex((item) => item.id === currentId);
  if (idx < 0) return null;
  return items[idx + delta]?.id ?? null;
}

/**
 * The open question after the list changed under it.
 *
 * On two panes a pane is never empty while there is something to show, so a
 * filter that drops the open question moves to the first one. On a phone the
 * reader covers the screen, so it closes instead: the student changed the
 * list, they should see it.
 */
export function reconcileCurrent(
  items: { id: string }[],
  currentId: string | null,
  layout: 'panes' | 'reader',
): string | null {
  if (currentId && items.some((item) => item.id === currentId)) return currentId;
  if (layout === 'panes') return items[0]?.id ?? null;
  return null;
}

/** Broad subjects: every JEE maths question says "mathematics", which says nothing. */
const BROAD = new Set(['mathematics', 'aptitude', 'drawing', 'general_aptitude']);

/**
 * The one topic worth printing under a question: the most specific category.
 * "Sets & Relations" rather than two chips reading "Mathematics" and
 * "Sets & Relations".
 */
export function topicCaption(categories: string[] | null | undefined, labels?: Record<string, string>): string | null {
  if (!categories?.length) return null;
  const specific = categories.find((c) => !BROAD.has(c)) ?? categories[0];
  return labels?.[specific] ?? QB_CATEGORY_LABELS[specific as QBCategory] ?? humanise(specific);
}

const APTITUDE_CATEGORIES = ['aptitude', 'general_aptitude'];

/**
 * Whether a question's difficulty is worth printing. Not for aptitude: a
 * figure puzzle is easy once you know the trick and hard until you do, so
 * "Medium" on it says nothing. Maths keeps its difficulty.
 *
 * A paper question carries its section. A question never tied to a paper
 * falls back to its categories.
 */
export function showsDifficulty(q: { section?: string | null; categories?: string[] | null }): boolean {
  if (q.section) return q.section !== 'aptitude';
  const cats = q.categories ?? [];
  const aptitude = cats.some((c) => APTITUDE_CATEGORIES.includes(c)) && !cats.includes('mathematics');
  return !aptitude;
}

function humanise(slug: string): string {
  const words = slug.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
