/**
 * Academic-year helpers for the alumni graduation workspace.
 *
 * These used to be a hand-copied duplicate of the arithmetic in
 * `@neram/database`, and the two drifted. They are now re-exports, so the admin
 * app, Nexus and the intake forms all agree on what '2026-27' means (the cohort
 * that writes the exam in 2027). Import sites are unchanged.
 */

export {
  ACADEMIC_YEAR_REGEX,
  academicYearOptions,
  currentAcademicYear,
  examYearFromAcademicYear,
} from '@neram/database';

import { deriveAcademicYearFromExamYear } from '@neram/database';

/**
 * 2026 -> '2025-26'. Only used to seed the batch dropdown from a legacy
 * target_exam_year when a student has an exam year but no academic_year yet.
 *
 * Kept as a thin wrapper because callers rely on the empty-string return for a
 * missing value, whereas the shared helper returns null.
 */
export function academicYearFromExamYear(examYear: number | null | undefined): string {
  return deriveAcademicYearFromExamYear(examYear) ?? '';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
