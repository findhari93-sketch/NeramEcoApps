/**
 * Academic-year arithmetic, in one place.
 *
 * The Indian academic year runs April -> March and is written 'YYYY-YY'.
 * '2026-27' starts in April 2026 and its cohort writes the entrance exam in
 * **2027**. That single sentence is the whole convention, and it is the one
 * `academic_batches` labels itself with ('2026-27' is seeded as 'NATA/JEE 2027').
 *
 * This module exists because the derivation had drifted into four copies, one of
 * which disagreed with the other three. `queries/crm.ts` and the admin app's
 * `components/crm/academic-years.ts` now re-export from here, so a fix lands
 * everywhere at once. Keep it pure: it is imported by client components as well
 * as server routes, so no Supabase client and no `process.env`.
 */

import type { NexusStudyStage } from '../types';

export const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/**
 * Format a start year as 'YYYY-YY'. The trailing pair is modulo 100 so a
 * century boundary reads 2099-00 rather than 2099-100.
 */
function formatAcademicYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** The start year of a cohort code, or null when the code is malformed. */
export function startYearOf(academicYear: string | null | undefined): number | null {
  const match = ACADEMIC_YEAR_REGEX.exec(academicYear || '');
  return match ? Number(academicYear!.slice(0, 4)) : null;
}

/** The cohort string for a date. April 2026 -> '2026-27', March 2026 -> '2025-26'. */
export function currentAcademicYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0 = Jan
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1; // April (index 3) starts the year
  return formatAcademicYear(startYear);
}

/** '2026-27' -> 2027, the calendar year the cohort writes the exam. */
export function examYearFromAcademicYear(academicYear: string | null | undefined): number | null {
  const startYear = startYearOf(academicYear);
  return startYear === null ? null : startYear + 1;
}

/**
 * The cohort that prepares for a given exam year. Exam in 2027 -> '2026-27'.
 * Returns null for anything that is not a plausible integer year, which is what
 * keeps a NaN from an unparsed form value out of the database.
 */
export function deriveAcademicYearFromExamYear(examYear?: number | null): string | null {
  if (!examYear || !Number.isInteger(examYear) || examYear < 2000 || examYear > 2100) {
    return null;
  }
  return formatAcademicYear(examYear - 1);
}

/** Shift a cohort code by whole years. '2026-27' +1 -> '2027-28'. */
export function addAcademicYears(academicYear: string | null | undefined, years: number): string | null {
  const startYear = startYearOf(academicYear);
  return startYear === null ? null : formatAcademicYear(startYear + years);
}

/**
 * Selectable cohorts: two years ahead of the current one, down to 2022-23.
 * Generated rather than read from the batch registry so a year like 2025-26 is
 * always pickable even when no open batch row exists for it.
 */
export function academicYearOptions(date: Date = new Date()): string[] {
  const startYear = startYearOf(currentAcademicYear(date))!;
  const years: string[] = [];
  for (let y = startYear + 2; y >= 2022; y--) {
    years.push(formatAcademicYear(y));
  }
  return years;
}

/**
 * Read whatever an intake form put in its "when will you write the exam" field.
 *
 * THIS IS THE BUG FIX. The apply and enroll wizards generate that dropdown in
 * academic-year format, so the answer arrives as the string '2026-27'. Every
 * intake route ran it through `Number(...)`, which yields NaN, so
 * `lead_profiles.target_exam_year` (an INTEGER column) landed NULL and a
 * `|| currentAcademicYear()` fallback then stamped users.academic_year with the
 * CURRENT cohort regardless of the applicant's class. That is why Class 11
 * students in the live classroom read as sitting the exam this year.
 *
 * Accepts either shape and returns both representations, or nulls when the answer
 * is unusable. Callers must persist the nulls rather than substituting a guess: an
 * empty exam year is visibly missing and gets fixed, a confidently wrong one does
 * not.
 */
export function parseExamYearAnswer(raw: unknown): {
  examYear: number | null;
  academicYear: string | null;
} {
  if (raw === null || raw === undefined || raw === '') {
    return { examYear: null, academicYear: null };
  }

  // Already a cohort code, straight off the form's dropdown.
  if (typeof raw === 'string' && ACADEMIC_YEAR_REGEX.test(raw)) {
    return { examYear: examYearFromAcademicYear(raw), academicYear: raw };
  }

  // A calendar exam year, which is what the admin dialogs write.
  const asNumber = typeof raw === 'number' ? raw : Number(raw);
  const academicYear = deriveAcademicYearFromExamYear(asNumber);
  return academicYear === null
    ? { examYear: null, academicYear: null }
    : { examYear: asNumber, academicYear };
}

/**
 * How far away a cohort's exam is, relative to the current cohort.
 * 'past' is the group whose exam has already been written; they normally leave
 * through the Graduate Batch flow rather than sitting on a past year.
 */
export type YearTier = 'this_year' | 'next_year' | 'later' | 'past' | 'unset';

export function yearTier(
  academicYear: string | null | undefined,
  currentCode: string,
): YearTier {
  const start = startYearOf(academicYear);
  const current = startYearOf(currentCode);
  if (start === null || current === null) return 'unset';
  if (start === current) return 'this_year';
  if (start === current + 1) return 'next_year';
  return start > current ? 'later' : 'past';
}

/**
 * The exam year a class implies, given the cohort we are in now.
 *
 * This is the pairing the UI teaches and the mismatch detector enforces. It is
 * deliberately NOT applied automatically: staff set the two fields
 * independently, and a disagreement is flagged rather than silently corrected,
 * because a repeater or an early attempt is a legitimate exception.
 *
 *   Break Year -> C      (finished Class 12, preparing full time)
 *   Class 12   -> C
 *   Class 11   -> C + 1
 *   Class 10   -> C + 2
 */
export function expectedYearForStage(
  stage: NexusStudyStage | 'unset' | null | undefined,
  currentCode: string,
): string | null {
  switch (stage) {
    case 'gap_year':
    case '12th':
      return startYearOf(currentCode) === null ? null : currentCode;
    case '11th':
      return addAcademicYears(currentCode, 1);
    case '10th':
      return addAcademicYears(currentCode, 2);
    default:
      return null;
  }
}

/**
 * Whether a student's class and exam year agree.
 *
 * 'unknown' means neither is set, so there is nothing to check yet. The three
 * incomplete states are distinguished because the students screen offers a
 * different fix for each one.
 */
export type PairStatus = 'ok' | 'mismatch' | 'no_stage' | 'no_year' | 'unknown';

export function pairStatus(
  stage: NexusStudyStage | 'unset' | null | undefined,
  academicYear: string | null | undefined,
  currentCode: string,
): PairStatus {
  const hasStage = stage === 'gap_year' || stage === '12th' || stage === '11th' || stage === '10th';
  const hasYear = startYearOf(academicYear) !== null;

  if (!hasStage && !hasYear) return 'unknown';
  if (!hasStage) return 'no_stage';
  if (!hasYear) return 'no_year';

  const expected = expectedYearForStage(stage, currentCode);
  // A malformed currentCode must never manufacture a mismatch.
  if (expected === null) return 'ok';
  return expected === academicYear ? 'ok' : 'mismatch';
}
