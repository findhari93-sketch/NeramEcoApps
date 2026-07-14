/**
 * Academic-year helpers for the alumni graduation workspace.
 * Academic year in India runs April -> March, formatted 'YYYY-YY' (e.g. 2025-26).
 */

export const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/** The cohort string for a given date. April 2026 -> '2026-27', March 2026 -> '2025-26'. */
export function currentAcademicYear(date: Date = new Date()): string {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * A sensible list of selectable academic years: two years ahead of the current
 * cohort down to 2022-23. Generated (not derived from data) so a year like
 * 2025-26 is always pickable even when the current filter hides it.
 */
export function academicYearOptions(): string[] {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const years: string[] = [];
  for (let y = startYear + 2; y >= 2022; y--) {
    years.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  }
  return years;
}

/**
 * '2026-27' -> 2027 (the calendar year the batch writes the exam).
 * The exam year is the batch's second calendar year, i.e. start year + 1.
 */
export function examYearFromAcademicYear(ay: string | null | undefined): number | null {
  const m = /^([0-9]{4})-[0-9]{2}$/.exec(ay || '');
  return m ? Number(m[1]) + 1 : null;
}

/**
 * 2026 -> '2025-26'. Only used to seed the batch dropdown from a legacy
 * target_exam_year when a student has an exam year but no academic_year yet.
 */
export function academicYearFromExamYear(examYear: number | null | undefined): string {
  if (!examYear) return '';
  return `${examYear - 1}-${String(examYear % 100).padStart(2, '0')}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
