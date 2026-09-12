/**
 * The application form, read for the two facts Nexus needs from it: which class
 * the student is in and which year they sit the exam.
 *
 * One users row can hold several lead_profiles rows (a draft, a direct-link form,
 * a form staff started), so the one that counts is the newest that says something
 * about the student. A row holding nothing but an exam year is not a form: that is
 * the mirror the classification routes keep in step.
 *
 * WHEN A VALUE IS SAFE TO COPY. The last automatic write to these fields stamped a
 * whole classroom with the wrong cohort, so the fill is deliberately narrow:
 *
 *   - only a MISSING value is ever written, never a changed one;
 *   - an exam year that has already been written is never copied;
 *   - a class and exam year that disagree (pairStatus 'mismatch') are both held
 *     back for staff, whichever side came from the form;
 *   - an exam year is copied only beside a known class, so the pair can be checked;
 *   - a class is copied when it fits the exam year, or when the form was filled in
 *     this academic year. Last year's "Class 11" is this year's Class 12.
 *
 * Anything held back comes with a sentence saying why, for the review sheet.
 * Pure, so the automatic fill, the link route, the suggestions and the tests share
 * one set of rules.
 */

import {
  currentAcademicYear,
  deriveAcademicYearFromExamYear,
  mapClassToStandard,
  pairStatus,
  startYearOf,
  type NexusStudyStage,
} from '@neram/database';

export interface ApplicationForm {
  id?: string;
  user_id: string;
  application_number?: string | null;
  academic_data?: Record<string, any> | null;
  applicant_category?: string | null;
  target_exam_year?: number | string | null;
  father_name?: string | null;
  first_name?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  source?: string | null;
  status?: string | null;
  created_at: string;
}

/**
 * Is this row an application form, as far as Nexus is concerned: a submitted form
 * (it has an application number), or one that says what the student is studying?
 *
 * A row with only a father's name or an exam year is not. The student's own
 * complete-profile page makes rows like that, and counting one did two kinds of
 * damage: the student stopped showing as having no form, which hid the real form
 * sitting on their other record, and once linked, the empty row won as the newest.
 */
export function isApplicationForm(row: ApplicationForm | null | undefined): boolean {
  if (!row) return false;
  return Boolean(
    String(row.application_number ?? '').trim() || row.academic_data?.current_class || row.applicant_category,
  );
}

/** The newest row that is a real form, or null. */
export function pickApplicationForm<T extends ApplicationForm>(rows: readonly T[] | null | undefined): T | null {
  let best: T | null = null;
  for (const row of rows || []) {
    if (!isApplicationForm(row)) continue;
    if (!best || new Date(row.created_at).getTime() > new Date(best.created_at).getTime()) best = row;
  }
  return best;
}

const CLASS_LABEL: Record<string, string> = {
  '8': 'Class 8',
  '9': 'Class 9',
  '10': 'Class 10',
  '11': 'Class 11',
  '12': 'Class 12',
  '12_completed': '12th completed',
};

const CATEGORY_LABEL: Record<string, string> = {
  school_student: 'School student',
  diploma_student: 'Diploma student',
  college_student: 'College student',
  working_professional: 'Working professional',
  professional: 'Working professional',
};

/** "Class 12" or "College student", as the form put it, or null when it is silent. */
export function formClassLabel(form: ApplicationForm | null | undefined): string | null {
  const rawClass = form?.academic_data?.current_class;
  if (rawClass) return CLASS_LABEL[String(rawClass)] ?? String(rawClass);
  const category = form?.applicant_category;
  if (category) return CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
  return null;
}

/** The calendar year the form says they sit the exam, or null. */
export function formExamYear(form: ApplicationForm | null | undefined): number | null {
  const raw = form?.target_exam_year;
  const year = typeof raw === 'number' ? raw : raw ? Number(raw) : NaN;
  return deriveAcademicYearFromExamYear(year) ? year : null;
}

export interface FillInput {
  stage: NexusStudyStage | null;
  academicYear: string | null;
  form: ApplicationForm | null;
  /** The registry's current batch code ('2026-27'). Without it no exam year is copied. */
  currentBatch: string | null;
  today: Date;
}

export interface FillPlan {
  /** Write this class, or leave the class alone when null. */
  studyStage: NexusStudyStage | null;
  /** Write this exam year, or leave it alone when null. */
  academicYear: string | null;
  /** Why something the form holds was not copied, one sentence each. */
  held: string[];
}

export function planApplicationFill(input: FillInput): FillPlan {
  const plan: FillPlan = { studyStage: null, academicYear: null, held: [] };
  const { form, currentBatch } = input;
  const hasStage = !!input.stage;
  const hasYear = startYearOf(input.academicYear) !== null;
  if (!form || (hasStage && hasYear)) return plan;

  const formStage = hasStage ? null : mapClassToStandard(form.academic_data ?? null, form.applicant_category ?? null);

  let formYear: string | null = null;
  if (!hasYear) {
    const examYear = formExamYear(form);
    const cohort = examYear === null ? null : deriveAcademicYearFromExamYear(examYear);
    const currentStart = startYearOf(currentBatch);
    if (cohort && currentStart !== null && startYearOf(cohort)! < currentStart) {
      plan.held.push(`The form says the ${examYear} exam, which is already over.`);
    } else if (cohort && currentStart !== null) {
      formYear = cohort;
    }
  }

  if (!formStage && !formYear) return plan;

  const stageAfter = input.stage ?? formStage;
  const yearAfter = hasYear ? input.academicYear : formYear;
  const pair = currentBatch ? pairStatus(stageAfter, yearAfter, currentBatch) : 'unknown';

  if (pair === 'mismatch') {
    plan.held.push('The class and the exam year do not fit together, so a person should choose.');
    return plan;
  }

  if (formStage) {
    const formFilledIn = currentAcademicYear(new Date(form.created_at));
    if (pair === 'ok' || formFilledIn === currentAcademicYear(input.today)) {
      plan.studyStage = formStage;
    } else {
      plan.held.push(`The form was filled in during ${formFilledIn}, so the class on it may be out of date.`);
    }
  }

  if (formYear) {
    if (pair === 'ok') plan.academicYear = formYear;
    else plan.held.push('The form gives an exam year but no class, so the two cannot be checked together.');
  }

  return plan;
}

// ── What the Students screen shows about a missing form ───────────────────────

/** Why a proposed form cannot be linked from Nexus. */
export type FormLinkBlock = 'other_microsoft_account' | 'both_fee_records';

/** A form on another record that may belong to the student. Carries no phone number. */
export interface FormCandidateView {
  userId: string;
  strength: 'strong' | 'likely';
  reasons: Array<'phone' | 'email' | 'full_name' | 'father_name'>;
  /** The name typed on that record, when it has one. */
  name: string | null;
  fatherName: string | null;
  place: string | null;
  classLabel: string | null;
  examYear: number | null;
  appliedAt: string;
  applicationNumber: string | null;
  hasFeeRecord: boolean;
  blocked: FormLinkBlock | null;
}

/** A student whose own record holds no application form, with what may be theirs. */
export interface StudentFormReview {
  id: string;
  name: string;
  email: string | null;
  candidates: FormCandidateView[];
}

/** What linking a form did, for the confirmation line. */
export interface FormLinkResult {
  linked: true;
  applicationNumber: string | null;
  filled: { studyStage: NexusStudyStage | null; academicYear: string | null };
  held: string[];
}
