/**
 * How complete a student's application form is, as one rule every app reads.
 *
 * Before this module there were three answers to "has this student given us their
 * details?" and they disagreed:
 *
 *   - Admin's students grid called a student Complete when a lead_profiles row
 *     existed with a submitted/reviewed/enrolled status. No field was ever checked,
 *     so a row holding a single value showed a green tick.
 *   - Admin's alumni panel kept a copy-pasted twin of that same set.
 *   - Nexus asked a different question again (isApplicationForm: does this row say
 *     anything about what the student is studying?) for a different purpose.
 *
 * The status answer cannot be trusted, because every write path stamps a status at
 * insert time: the direct-enrollment flow writes 'enrolled', the Admin dialog writes
 * 'enrolled', the student's own complete-profile page writes 'enrolled'. The status
 * records how the row was born, not what is in it.
 *
 * So completeness is measured on the fields, and it is deliberately a THREE-state
 * answer. 'missing' means no form at all and is the list worth chasing. 'partial'
 * means we have their form and some fields are blank, which is the normal state of
 * most records and must not be dressed up as a failure.
 *
 * Pure and dependency-free on purpose, so the Admin grid, the Nexus sheet, the
 * student's own form and the tests all share one definition.
 *
 * NOTE for anyone extending this: it does NOT decide whether a row counts as an
 * application form. That question belongs to isApplicationForm in
 * apps/nexus/src/lib/application-form.ts, which deliberately rejects thin rows so a
 * student's real form sitting on another record is not hidden. This module only
 * grades a row once something else has decided it is one.
 */

import { parseExamYearAnswer } from './academic-year';

export type ApplicationField =
  | 'first_name'
  | 'father_name'
  | 'date_of_birth'
  | 'applicant_category'
  | 'academic_detail'
  | 'target_exam_year'
  | 'city'
  | 'state';

export type ApplicationState = 'complete' | 'partial' | 'missing';

/** Every field the rule requires, in the order a person would ask for them. */
export const REQUIRED_APPLICATION_FIELDS: readonly ApplicationField[] = [
  'first_name',
  'father_name',
  'date_of_birth',
  'applicant_category',
  'academic_detail',
  'target_exam_year',
  'city',
  'state',
] as const;

/**
 * What each missing field is called in a sentence a member of staff reads.
 * 'academic_detail' carries a placeholder label here because its real wording
 * depends on the category: a school student is missing their class, a college
 * student their college. See academicLabel below.
 */
const FIELD_LABEL: Record<ApplicationField, string> = {
  first_name: 'name',
  father_name: 'father name',
  date_of_birth: 'date of birth',
  applicant_category: 'what they are studying',
  academic_detail: 'class',
  target_exam_year: 'exam year',
  city: 'city',
  state: 'state',
};

/**
 * Names the apply form writes when it has nothing better. A users row created by a
 * phone sign-in is literally called "User", so treating that as a real name would
 * mark a nameless record complete. Mirrors PLACEHOLDER_NAMES in
 * apps/nexus/src/lib/application-form-match.ts.
 */
const PLACEHOLDER_NAMES = new Set(['user', 'student', 'unnamed student']);

/** The subset of lead_profiles this rule reads. Anything wider is a different job. */
export interface ApplicationLeadLike {
  first_name?: string | null;
  father_name?: string | null;
  date_of_birth?: string | null;
  applicant_category?: string | null;
  /**
   * JSONB, so deliberately untyped here. Narrowing it to Record<string, any> made
   * every caller cast, because the generated row type is `Json` and a Json is not
   * assignable to an index signature.
   */
  academic_data?: any;
  target_exam_year?: number | string | null;
  city?: string | null;
  state?: string | null;
}

/** The subset of users this rule reads. Date of birth and name live on both tables. */
export interface ApplicationUserLike {
  first_name?: string | null;
  name?: string | null;
  date_of_birth?: string | null;
}

export interface ApplicationAssessment {
  state: ApplicationState;
  /** Required fields with no usable value, in REQUIRED_APPLICATION_FIELDS order. */
  missing: ApplicationField[];
  /** One sentence for a tooltip. Empty string when nothing is missing. */
  summary: string;
}

/** A value counts only when it is a non-blank string or a real number. */
function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim() !== '';
}

/** A name counts only when it is not one of the form's placeholders. */
function realName(value: unknown): boolean {
  if (!filled(value)) return false;
  return !PLACEHOLDER_NAMES.has(String(value).trim().toLowerCase());
}

/**
 * Which academic key proves the student told us what they are studying.
 *
 * This is category-aware because the same blank means different things. A school
 * student with no academic_data.current_class has genuinely not told us. A working
 * professional never had a class to give, and requiring one of them would leave a
 * complete record permanently orange.
 */
function hasAcademicDetail(lead: ApplicationLeadLike): boolean {
  const data = lead.academic_data || {};
  switch (String(lead.applicant_category || '')) {
    case 'school_student':
      return filled(data.current_class);
    case 'college_student':
    case 'diploma_student':
      return filled(data.college_name);
    case 'working_professional':
    case 'professional':
      // The category is the whole answer for them.
      return true;
    default:
      // No category yet. That is already reported as a missing applicant_category,
      // so do not also accuse them of hiding a class they were never asked for.
      return true;
  }
}

/** The label for a missing academic detail, which depends on the category. */
function academicLabel(lead: ApplicationLeadLike): string {
  switch (String(lead.applicant_category || '')) {
    case 'college_student':
    case 'diploma_student':
      return 'college';
    default:
      return 'class';
  }
}

/** Joins labels the way a person would say them: "a, b and c". */
function sentenceList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Grade one student's application.
 *
 * `lead` is the NEWEST non-deleted lead_profiles row, or null when they have none.
 * `user` supplies the fields that live on users as well as on lead_profiles; either
 * table satisfying one is enough, because the student's own complete-profile page
 * writes date of birth to users while the apply form writes it to lead_profiles.
 */
export function assessApplication(input: {
  lead?: ApplicationLeadLike | null;
  user?: ApplicationUserLike | null;
}): ApplicationAssessment {
  const lead = input.lead ?? null;
  const user = input.user ?? null;

  if (!lead) {
    return {
      state: 'missing',
      missing: [...REQUIRED_APPLICATION_FIELDS],
      summary: 'No application form has been filled in.',
    };
  }

  const missing: ApplicationField[] = [];

  if (!realName(user?.first_name) && !realName(lead.first_name) && !realName(user?.name)) {
    missing.push('first_name');
  }
  if (!filled(lead.father_name)) missing.push('father_name');
  if (!filled(user?.date_of_birth) && !filled(lead.date_of_birth)) missing.push('date_of_birth');
  if (!filled(lead.applicant_category)) missing.push('applicant_category');
  if (!hasAcademicDetail(lead)) missing.push('academic_detail');
  // '2026-27' is a valid answer and Number() turns it into NaN, so it goes through
  // the shared parser rather than a truthiness check.
  if (parseExamYearAnswer(lead.target_exam_year).examYear === null) missing.push('target_exam_year');
  if (!filled(lead.city)) missing.push('city');
  if (!filled(lead.state)) missing.push('state');

  if (missing.length === 0) {
    return { state: 'complete', missing: [], summary: '' };
  }

  const labels = missing.map((field) =>
    field === 'academic_detail' ? academicLabel(lead) : FIELD_LABEL[field],
  );
  return {
    state: 'partial',
    missing,
    summary: `Missing ${sentenceList(labels)}.`,
  };
}

/**
 * The old yes/no answer, for the few places that genuinely need one.
 * Prefer the three-state `state`: collapsing 'partial' into false is what made the
 * Incomplete count unreadable in the first place.
 */
export function isApplicationComplete(input: {
  lead?: ApplicationLeadLike | null;
  user?: ApplicationUserLike | null;
}): boolean {
  return assessApplication(input).state === 'complete';
}
