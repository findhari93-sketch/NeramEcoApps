// Shared visual tokens for the alumni directory (enterprise neutral + amber accent).
export const ACCENT = '#B45309';
export const ACCENT_SOFT = 'rgba(180,83,9,0.10)';
export const INK = '#0F172A';
export const MUTED = '#64748B';
export const LINE = '#E2E8F0';
export const HEAD_BG = '#F8FAFC';

export const COURSE_OPTIONS = [
  'Architecture (B.Arch)',
  'Planning (B.Plan)',
  'Design (B.Des)',
  'Interior Design',
  'Civil Engineering',
  'Fine Arts (BFA)',
  'Other',
];

export function avatarColor(name: string | null | undefined): string {
  const palette = ['#475569', '#0E7490', '#B45309', '#4F46E5', '#9D174D', '#0F766E'];
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

// Client-safe copies of the derived display helpers (the server versions live in
// @neram/database/queries/alumni; kept here so client components don't import
// server-only modules).
function currentAcademicStartYear(now: Date = new Date()): number {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

export function deriveYearOfStudy(startYear?: number | null, now: Date = new Date()): number | null {
  if (!startYear || startYear < 2000 || startYear > 2100) return null;
  const y = currentAcademicStartYear(now) - startYear + 1;
  if (y < 1) return null;
  return Math.min(y, 6);
}

export function isGraduateArchitect(
  startYear?: number | null,
  expectedGraduationYear?: number | null,
  courseYears = 5,
  now: Date = new Date(),
): boolean {
  const yr = now.getFullYear();
  if (expectedGraduationYear) return yr > expectedGraduationYear;
  if (startYear) return yr - startYear >= courseYears;
  return false;
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
export function yearOfStudyLabel(startYear?: number | null): string | null {
  const y = deriveYearOfStudy(startYear);
  return y ? `${ORDINALS[y]} year` : null;
}
