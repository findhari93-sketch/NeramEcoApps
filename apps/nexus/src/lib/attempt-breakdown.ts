/**
 * Correct, wrong, skipped, out of how many.
 *
 * A score of "38 of 45 marks" does not say whether the seven lost marks were
 * seven wrong answers or seven questions never reached. Those are different
 * problems: the first is about the material, the second is about the clock, the
 * paper, or something going wrong mid-test.
 *
 * Skipping matters here more than it would elsewhere because there is no
 * negative marking. A student with nothing to lose by guessing who still left
 * questions blank did not choose to leave them blank, so a skip count is the
 * cheapest signal available that a sitting went wrong.
 *
 * PURE, and nothing new is stored or queried: every field this reads is already
 * on the review rows that GradedReviewList renders one at a time.
 */

export interface AttemptBreakdown {
  /** Gradable questions the student put an answer to. */
  answered: number;
  correct: number;
  wrong: number;
  /** Gradable questions left blank. The number worth noticing. */
  skipped: number;
  /** Questions that can be marked automatically. The honest denominator. */
  gradable: number;
  /** Everything the student saw, including drawings a human marks later. */
  total: number;
}

/**
 * An answer counts as given only if there is something in it.
 *
 * An empty string is what an untouched input posts, and treating it as an
 * answer would report a blank question as wrong, which reads to a teacher as a
 * student who tried and failed rather than one who never got there.
 */
function hasAnswer(selected: unknown): boolean {
  if (selected == null) return false;
  if (typeof selected === 'string') return selected.trim().length > 0;
  if (Array.isArray(selected)) return selected.length > 0;
  return true;
}

/**
 * Break one attempt down into what happened to each question.
 *
 * Drawing questions are counted in `total` but never in `gradable`, so they can
 * never be reported as skipped. A drawing waiting on a human marker is not a
 * question the student ducked, and counting it as one would put a skip on the
 * record of every student who did the paper properly.
 */
export function summariseAttempt(
  review: Array<{ selected?: unknown; is_correct?: boolean | null; is_gradable?: boolean | null }>,
): AttemptBreakdown {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let gradable = 0;

  for (const r of review || []) {
    // is_gradable is absent on older shapes rather than false, so the default
    // has to be "gradable". Defaulting the other way would silently report a
    // whole paper as ungraded and every count as zero.
    if (r.is_gradable === false) continue;
    gradable += 1;
    if (!hasAnswer(r.selected)) skipped += 1;
    else if (r.is_correct) correct += 1;
    else wrong += 1;
  }

  return { answered: correct + wrong, correct, wrong, skipped, gradable, total: (review || []).length };
}

/**
 * The one-line version, for a drawer header.
 *
 * Skipped is named only when there is one. A "0 skipped" on every well-run
 * sitting would train teachers to stop reading the line, which costs exactly
 * the signal the count exists to carry.
 */
export function formatBreakdown(b: AttemptBreakdown): string {
  const parts = [`${b.correct} right`, `${b.wrong} wrong`];
  if (b.skipped > 0) parts.push(`${b.skipped} skipped`);
  return `${parts.join(' · ')} of ${b.gradable}`;
}
