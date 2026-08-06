/**
 * How one MCQ option is identified, in one place.
 *
 * The take page submits a key, the grader compares that key against the bank's
 * `correct_answer`, and the review highlights whichever option matches. All
 * three have to agree. They did not: the player keyed on
 * `label || id || index` while the review compared `option.id` alone, so on any
 * question whose options carry a label the review marked the right answer wrong
 * and the student's own choice as unselected.
 */

export interface KeyedOption {
  id?: string;
  label?: string;
}

/** The key this option is answered by. Position is the last resort, not the first. */
export function optionKeyAt(option: KeyedOption, index: number): string {
  return option.label || option.id || String(index);
}

/**
 * Do these two keys name the same option?
 *
 * Mirrors the MCQ branch of gradeQBAnswerStrict, which trims and lowercases
 * both sides. Anything stricter here tells a student they got wrong what the
 * server marked right.
 */
export function sameChoice(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
