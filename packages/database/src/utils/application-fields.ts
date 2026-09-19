/**
 * The application form's vocabulary and its validation, in one place.
 *
 * There were already two copies of these option lists, in
 * apps/marketing/src/components/apply/types.ts and in the Nexus student's
 * complete-profile page, and they had drifted in a way that corrupted data: the
 * marketing form emits a cohort code ('2026-27') for the exam year while the Nexus
 * page emits a calendar year, and one consumer ran Number() over both. A third copy
 * for the student-link form would have made that worse, so the values, the labels
 * and the rules live here and every form imports them.
 *
 * Pure and synchronous: no Supabase client, no process.env. Client components in
 * three apps import this, same house rule as academic-year.ts.
 */

import { ACADEMIC_YEAR_REGEX, parseExamYearAnswer } from './academic-year';

export interface FieldOption {
  value: string;
  label: string;
}

/*
 * These are all prefixed APPLICATION_ on purpose.
 *
 * types/index.ts already exports APPLICANT_CATEGORY_OPTIONS and SCHOOL_TYPE_OPTIONS,
 * and exporting the same bare names from here silently shadowed them and broke the
 * apply wizard's academic step, which relies on the richer shape (a `description`
 * per category, and a `value` typed as ApplicantCategory rather than string).
 *
 * The class list in particular must NOT be confused with CURRENT_CLASS_OPTIONS in
 * types/index.ts, which uses a different and incompatible vocabulary ('10th',
 * '12th-pass'). The values below are the ones academic_data.current_class actually
 * holds, and the ones mapClassToStandard and formClassLabel read.
 */
export const APPLICATION_GENDER_OPTIONS: readonly FieldOption[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

export const APPLICATION_CATEGORY_OPTIONS: readonly FieldOption[] = [
  { value: 'school_student', label: 'School student' },
  { value: 'diploma_student', label: 'Diploma student' },
  { value: 'college_student', label: 'College student' },
  { value: 'working_professional', label: 'Working professional' },
] as const;

export const APPLICATION_CLASS_OPTIONS: readonly FieldOption[] = [
  { value: '8', label: 'Class 8' },
  { value: '9', label: 'Class 9' },
  { value: '10', label: 'Class 10' },
  { value: '11', label: 'Class 11' },
  { value: '12', label: 'Class 12' },
  { value: '12_completed', label: 'Finished Class 12' },
] as const;

export const APPLICATION_SCHOOL_TYPE_OPTIONS: readonly FieldOption[] = [
  { value: 'private_school', label: 'Private school' },
  { value: 'government_aided', label: 'Government aided' },
  { value: 'government_school', label: 'Government school' },
] as const;

export const APPLICATION_COURSE_OPTIONS: readonly FieldOption[] = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'Both NATA and JEE Paper 2' },
  { value: 'not_sure', label: 'Not sure yet' },
] as const;

/** Categories for whom "which class are you in" is not a question. */
const NON_SCHOOL_CATEGORIES = new Set(['diploma_student', 'college_student', 'working_professional']);
/** Categories that study at a named college rather than a school. */
const COLLEGE_CATEGORIES = new Set(['diploma_student', 'college_student']);

/**
 * Exam years to offer, as cohort codes ('2026-27'), newest first.
 *
 * The VALUE is the cohort, never the calendar year, because that is what
 * parseExamYearAnswer round-trips safely in both directions. The label spells the
 * exam year out, because "2026-27" alone has been read as both by students.
 * The academic year turns over in April, as currentAcademicYear does.
 */
export function examYearOptions(today: Date = new Date()): FieldOption[] {
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return Array.from({ length: 4 }, (_, i) => {
    const from = startYear + i;
    const to = String((from + 1) % 100).padStart(2, '0');
    return { value: `${from}-${to}`, label: `${from}-${to} (exam in ${from + 1})` };
  });
}

/** What a student may send us. Everything optional here; requiredness is a rule below. */
export interface ApplicationAnswers {
  first_name?: string;
  father_name?: string;
  date_of_birth?: string;
  gender?: string;
  phone?: string;
  parent_phone?: string;
  applicant_category?: string;
  current_class?: string;
  school_name?: string;
  college_name?: string;
  target_exam_year?: string;
  interest_course?: string;
  pincode?: string;
  city?: string;
  district?: string;
  state?: string;
  address?: string;
}

export interface FieldError {
  field: keyof ApplicationAnswers;
  message: string;
}

/** Only these keys are ever read off the wire. Anything else is rejected outright. */
export const ALLOWED_ANSWER_KEYS: readonly (keyof ApplicationAnswers)[] = [
  'first_name',
  'father_name',
  'date_of_birth',
  'gender',
  'phone',
  'parent_phone',
  'applicant_category',
  'current_class',
  'school_name',
  'college_name',
  'target_exam_year',
  'interest_course',
  'pincode',
  'city',
  'district',
  'state',
  'address',
] as const;

const PLACEHOLDER_NAMES = new Set(['user', 'student', 'unnamed student', 'na', 'n/a', 'nil']);

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function inOptions(value: string, options: readonly FieldOption[]): boolean {
  return options.some((option) => option.value === value);
}

/** Digits only, 10 to 15, optionally with a leading +. Deliberately loose: parents abroad. */
function looksLikePhone(value: string): boolean {
  return /^\+?[0-9]{10,15}$/.test(value.replace(/[\s-]/g, ''));
}

/**
 * A date of birth that could belong to a student.
 * The bounds are wide on purpose: the point is to catch a mistyped year or a date
 * in the future, not to judge who is allowed to study for the exam.
 */
function plausibleBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const years = (Date.now() - date.getTime()) / (365.25 * 86_400_000);
  return years >= 8 && years <= 70;
}

/**
 * Check what a student sent and normalise it.
 *
 * Returns every problem at once rather than the first, so a form can mark all the
 * offending fields in one pass instead of making someone submit five times.
 */
export function validateApplicationAnswers(
  raw: unknown,
): { ok: true; answers: ApplicationAnswers } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: 'first_name', message: 'No answers were sent.' }] };
  }

  const source = raw as Record<string, unknown>;

  // An unexpected key means a caller is trying to write something this form does not
  // own. Refuse the whole payload rather than silently dropping it.
  const unknownKey = Object.keys(source).find(
    (key) => !(ALLOWED_ANSWER_KEYS as readonly string[]).includes(key),
  );
  if (unknownKey) {
    return {
      ok: false,
      errors: [{ field: 'first_name', message: `"${unknownKey}" is not a field on this form.` }],
    };
  }

  const answers: ApplicationAnswers = {};
  for (const key of ALLOWED_ANSWER_KEYS) {
    const value = str(source[key]);
    if (value) answers[key] = value;
  }

  const firstName = answers.first_name || '';
  if (!firstName) {
    errors.push({ field: 'first_name', message: 'Please tell us your name.' });
  } else if (PLACEHOLDER_NAMES.has(firstName.toLowerCase())) {
    errors.push({ field: 'first_name', message: 'Please give your real name.' });
  } else if (firstName.length > 80) {
    errors.push({ field: 'first_name', message: 'That name is too long.' });
  }

  if (!answers.father_name) {
    errors.push({ field: 'father_name', message: "Please give your father's name." });
  } else if (answers.father_name.length > 80) {
    errors.push({ field: 'father_name', message: 'That name is too long.' });
  }

  if (!answers.date_of_birth) {
    errors.push({ field: 'date_of_birth', message: 'Please give your date of birth.' });
  } else if (!plausibleBirthDate(answers.date_of_birth)) {
    errors.push({ field: 'date_of_birth', message: 'Please check your date of birth.' });
  }

  if (answers.gender && !inOptions(answers.gender, APPLICATION_GENDER_OPTIONS)) {
    errors.push({ field: 'gender', message: 'Please pick one of the options.' });
  }

  if (answers.phone && !looksLikePhone(answers.phone)) {
    errors.push({ field: 'phone', message: 'Please check your phone number.' });
  }
  if (answers.parent_phone && !looksLikePhone(answers.parent_phone)) {
    errors.push({ field: 'parent_phone', message: "Please check your parent's phone number." });
  }

  const category = answers.applicant_category || '';
  if (!category) {
    errors.push({ field: 'applicant_category', message: 'Please tell us what you are studying.' });
  } else if (!inOptions(category, APPLICATION_CATEGORY_OPTIONS)) {
    errors.push({ field: 'applicant_category', message: 'Please pick one of the options.' });
  } else if (!NON_SCHOOL_CATEGORIES.has(category)) {
    // A school student owes us a class.
    if (!answers.current_class) {
      errors.push({ field: 'current_class', message: 'Please tell us which class you are in.' });
    } else if (!inOptions(answers.current_class, APPLICATION_CLASS_OPTIONS)) {
      errors.push({ field: 'current_class', message: 'Please pick one of the options.' });
    }
  } else if (COLLEGE_CATEGORIES.has(category) && !answers.college_name) {
    errors.push({ field: 'college_name', message: 'Please tell us your college.' });
  }

  if (!answers.target_exam_year) {
    errors.push({ field: 'target_exam_year', message: 'Please tell us which year you write the exam.' });
  } else if (
    !ACADEMIC_YEAR_REGEX.test(answers.target_exam_year) ||
    parseExamYearAnswer(answers.target_exam_year).examYear === null
  ) {
    errors.push({ field: 'target_exam_year', message: 'Please pick one of the options.' });
  }

  if (answers.interest_course && !inOptions(answers.interest_course, APPLICATION_COURSE_OPTIONS)) {
    errors.push({ field: 'interest_course', message: 'Please pick one of the options.' });
  }

  if (answers.pincode && !/^[0-9]{6}$/.test(answers.pincode)) {
    errors.push({ field: 'pincode', message: 'A pincode has six digits.' });
  }

  if (!answers.city) errors.push({ field: 'city', message: 'Please give your town or city.' });
  if (!answers.state) errors.push({ field: 'state', message: 'Please give your state.' });

  return errors.length ? { ok: false, errors } : { ok: true, answers };
}

/**
 * The part of the answers that belongs on `users`.
 *
 * `first_name` and `phone` are handed back separately by the caller's own "only if
 * empty" rule: a verified phone must never be overwritten by a typed one, and the
 * name on a Microsoft account is the one the school knows them by.
 */
export function toUserUpdates(answers: ApplicationAnswers): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (answers.date_of_birth) updates.date_of_birth = answers.date_of_birth;
  if (answers.gender) updates.gender = answers.gender;
  return updates;
}

/**
 * The part of the answers that belongs on `lead_profiles`.
 *
 * `academic_data` is returned as a patch to MERGE into whatever is already there,
 * never as a replacement: a form that only asks for the class must not wipe the
 * board and school name an earlier form captured.
 */
export function toLeadUpdates(answers: ApplicationAnswers): {
  fields: Record<string, unknown>;
  academicDataPatch: Record<string, unknown>;
} {
  const fields: Record<string, unknown> = {};
  if (answers.first_name) fields.first_name = answers.first_name;
  if (answers.father_name) fields.father_name = answers.father_name;
  if (answers.date_of_birth) fields.date_of_birth = answers.date_of_birth;
  if (answers.gender) fields.gender = answers.gender;
  if (answers.parent_phone) fields.parent_phone = answers.parent_phone;
  if (answers.applicant_category) fields.applicant_category = answers.applicant_category;
  if (answers.interest_course) fields.interest_course = answers.interest_course;
  if (answers.pincode) fields.pincode = answers.pincode;
  if (answers.city) fields.city = answers.city;
  if (answers.district) fields.district = answers.district;
  if (answers.state) fields.state = answers.state;
  if (answers.address) fields.address = answers.address;

  // Never Number() this. '2026-27' is a valid answer and Number() makes it NaN,
  // which is how a whole cohort lost its exam year once already.
  if (answers.target_exam_year) {
    const { examYear } = parseExamYearAnswer(answers.target_exam_year);
    if (examYear !== null) fields.target_exam_year = examYear;
  }

  const academicDataPatch: Record<string, unknown> = {};
  if (answers.current_class) academicDataPatch.current_class = answers.current_class;
  if (answers.school_name) academicDataPatch.school_name = answers.school_name;
  if (answers.college_name) academicDataPatch.college_name = answers.college_name;

  return { fields, academicDataPatch };
}
