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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
