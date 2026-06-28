/**
 * Exam document tagging for alumni profiles.
 *
 * Admin staff collect entrance-exam documents from graduated students. Each file is stored in the
 * shared `student_documents` table and tagged with a `category` slug so the UI can map a stored doc
 * back to its slot: (exam, attempt, kind). Custom documents (anything outside the fixed slots) use a
 * single category with a free-text title.
 *
 * Slug shape: `exam_<exam>_<kind>_<attempt>`, e.g. `exam_nata_admit_1`, `exam_nata_score_2`,
 * `exam_jee_admit_1`. This module is the single source of truth: never hand-write these strings.
 */

export type ExamKey = 'nata' | 'jee';
export type DocKind = 'admit' | 'score';

export const NATA_MAX_ATTEMPTS = 3;
export const JEE_MAX_ATTEMPTS = 2;

/** Category for a free-text named document (admit cards / scorecards use the slot slugs instead). */
export const CUSTOM_DOC_CATEGORY = 'exam_custom';

/** Every exam-related category starts with this prefix (used to keep these out of the generic list). */
export const EXAM_CATEGORY_PREFIX = 'exam_';

export const EXAM_LABELS: Record<ExamKey, string> = {
  nata: 'NATA',
  jee: 'JEE',
};

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  admit: 'Admit card',
  score: 'Scorecard',
};

export function maxAttempts(exam: ExamKey): number {
  return exam === 'nata' ? NATA_MAX_ATTEMPTS : JEE_MAX_ATTEMPTS;
}

/** Build the storage category slug for a fixed exam slot, e.g. `exam_nata_admit_1`. */
export function examDocCategory(exam: ExamKey, attempt: number, kind: DocKind): string {
  return `${EXAM_CATEGORY_PREFIX}${exam}_${kind}_${attempt}`;
}

/** Parse a slot slug back into its parts. Returns null for the custom category or anything else. */
export function parseExamDocCategory(
  category?: string | null,
): { exam: ExamKey; attempt: number; kind: DocKind } | null {
  if (!category) return null;
  const m = /^exam_(nata|jee)_(admit|score)_(\d+)$/.exec(category);
  if (!m) return null;
  return { exam: m[1] as ExamKey, kind: m[2] as DocKind, attempt: parseInt(m[3], 10) };
}

/** True for any exam-related category (fixed slots and custom docs). */
export function isExamCategory(category?: string | null): boolean {
  return !!category && category.startsWith(EXAM_CATEGORY_PREFIX);
}

/** Human title stored alongside a fixed slot doc, e.g. "NATA admit card (attempt 1)". */
export function examDocTitle(exam: ExamKey, attempt: number, kind: DocKind): string {
  return `${EXAM_LABELS[exam]} ${DOC_KIND_LABELS[kind].toLowerCase()} (attempt ${attempt})`;
}
