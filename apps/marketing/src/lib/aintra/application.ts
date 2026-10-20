/**
 * The application form, filled in by talking to Aintra (2026-10-20).
 *
 * Aintra asks the form's questions one or two at a time and saves each answer
 * to the student's draft application (the same lead_profiles draft the /apply
 * form saves and reopens). When nothing is missing it shows a summary card;
 * the student ticks the terms and taps Submit, which posts to /api/application
 * exactly as the form's Review step does.
 *
 * Pure, and shared by the server tool (what to save, what is missing) and the
 * card (the summary, the submit body), so the two cannot disagree. The rules
 * mirror components/apply/validation.ts.
 */
import { isPlausibleStatedExamYear } from '@neram/database/academic-year';
import { cleanDraftText } from './booking';

export type CurrentlyInAnswer =
  | 'class_8'
  | 'class_9'
  | 'class_10'
  | 'class_11'
  | 'class_12'
  | '12th_completed'
  | 'diploma'
  | 'college'
  | 'working';

export const CURRENTLY_IN: CurrentlyInAnswer[] = [
  'class_8',
  'class_9',
  'class_10',
  'class_11',
  'class_12',
  '12th_completed',
  'diploma',
  'college',
  'working',
];

/** The form's board codes (EDUCATION_BOARD_OPTIONS in @neram/database), with the names people say. */
export const BOARDS: Record<string, string> = {
  cbse: 'CBSE',
  icse: 'ICSE',
  state_tn: 'State Board (TN)',
  matriculation: 'Matriculation',
  state_ka: 'State Board (KA)',
  state_ap: 'State Board (AP)',
  state_ke: 'State Board (KE)',
  ib: 'IB',
  igcse: 'IGCSE',
  nios: 'NIOS',
  other: 'Other',
};

export const COURSES: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2 (B.Arch)',
  both: 'NATA and JEE Paper 2',
  not_sure: 'Not sure yet',
};

export type ProgrammeId = 'crash' | '1-year' | '2-year';
export const PROGRAMMES: ProgrammeId[] = ['crash', '1-year', '2-year'];

const CLASS_LABEL: Record<string, string> = {
  '8': 'Class 8',
  '9': 'Class 9',
  '10': 'Class 10',
  '11': 'Class 11',
  '12': 'Class 12',
  '12_completed': '12th completed',
};

/** The lead_profiles columns this flow reads and writes. */
export interface ApplicationRow {
  id?: string;
  status?: string;
  application_number?: string | null;
  first_name?: string | null;
  father_name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  country?: string | null;
  pincode?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  applicant_category?: string | null;
  academic_data?: Record<string, unknown> | null;
  target_exam_year?: number | null;
  interest_course?: string | null;
  fee_structure_id?: string | null;
  fee_source?: string | null;
  learning_mode?: string | null;
}

/** What the model may pass to save_application_details. */
export interface ApplicationAnswers {
  student_name?: string;
  father_name?: string;
  date_of_birth?: string;
  gender?: string;
  currently_in?: string;
  school_name?: string;
  board?: string;
  college_name?: string;
  department?: string;
  year_of_study?: number;
  twelfth_year?: number;
  completed_grade?: string;
  exam_year?: number;
  course?: string;
  programme?: string;
  pincode?: string;
}

export interface NormalisedAnswers {
  /** Columns to write (academic_data is merged with what is saved, not replaced). */
  patch: ApplicationRow;
  /** Answer -> why it was not saved, for the model to ask again. */
  rejected: Record<string, string>;
  /** Picked programme, resolved to a fee structure by the caller. */
  programme: ProgrammeId | null;
  pincode: string | null;
}

const CATEGORY_OF: Record<CurrentlyInAnswer, string> = {
  class_8: 'school_student',
  class_9: 'school_student',
  class_10: 'school_student',
  class_11: 'school_student',
  class_12: 'school_student',
  '12th_completed': 'school_student',
  diploma: 'diploma_student',
  college: 'college_student',
  working: 'working_professional',
};

const CLASS_OF: Partial<Record<CurrentlyInAnswer, string>> = {
  class_8: '8',
  class_9: '9',
  class_10: '10',
  class_11: '11',
  class_12: '12',
  '12th_completed': '12_completed',
};

function plausibleDob(value: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return false;
  const age = (now.getTime() - Date.parse(`${value}T00:00:00Z`)) / (365.25 * 86_400_000);
  return age >= 10 && age <= 60;
}

/**
 * The model's answers, checked and turned into lead_profiles columns. Anything
 * that does not fit the form's own options is left out and reported, never
 * guessed. `saved` is the row as it is now, so a school name can be added to a
 * class picked two messages ago.
 */
export function normaliseAnswers(a: ApplicationAnswers, saved: ApplicationRow | null, now = new Date()): NormalisedAnswers {
  const patch: ApplicationRow = {};
  const rejected: Record<string, string> = {};
  const academic: Record<string, unknown> = { ...(saved?.academic_data ?? {}) };
  let academicChanged = false;
  let category = saved?.applicant_category ?? null;

  const name = cleanDraftText(a?.student_name, 100);
  if (a?.student_name !== undefined) {
    if (name && name.length >= 2) patch.first_name = name;
    else rejected.student_name = 'needs at least 2 letters';
  }
  const father = cleanDraftText(a?.father_name, 100);
  if (a?.father_name !== undefined) {
    if (father && father.length >= 2) patch.father_name = father;
    else rejected.father_name = 'needs at least 2 letters';
  }
  if (a?.date_of_birth !== undefined) {
    const dob = String(a.date_of_birth).trim();
    if (plausibleDob(dob, now)) patch.date_of_birth = dob;
    else rejected.date_of_birth = 'use YYYY-MM-DD, a real date of birth';
  }
  if (a?.gender !== undefined) {
    const g = String(a.gender).trim().toLowerCase();
    if (g === 'male' || g === 'female' || g === 'other') patch.gender = g;
    else rejected.gender = 'male, female or other';
  }

  if (a?.currently_in !== undefined) {
    const c = String(a.currently_in).trim().toLowerCase() as CurrentlyInAnswer;
    if (CURRENTLY_IN.includes(c)) {
      const next = CATEGORY_OF[c];
      if (next !== category) {
        // A different kind of student: the old studies no longer apply.
        for (const k of Object.keys(academic)) delete academic[k];
      }
      category = next;
      patch.applicant_category = next;
      if (CLASS_OF[c]) academic.current_class = CLASS_OF[c];
      academicChanged = true;
    } else {
      rejected.currently_in = `one of ${CURRENTLY_IN.join(', ')}`;
    }
  }

  const school = cleanDraftText(a?.school_name, 150);
  if (school) {
    academic.school_name = school;
    academicChanged = true;
  }
  if (a?.board !== undefined) {
    const b = String(a.board).trim().toLowerCase();
    if (BOARDS[b]) {
      academic.board = b;
      academicChanged = true;
    } else rejected.board = `one of ${Object.keys(BOARDS).join(', ')}`;
  }
  const college = cleanDraftText(a?.college_name, 150);
  if (college) {
    academic.college_name = college;
    academicChanged = true;
  }
  const department = cleanDraftText(a?.department, 100);
  if (department) {
    academic.department = department;
    academicChanged = true;
  }
  if (a?.year_of_study !== undefined) {
    const y = Number(a.year_of_study);
    if (Number.isInteger(y) && y >= 1 && y <= 5) {
      academic.year_of_study = y;
      academicChanged = true;
    } else rejected.year_of_study = '1 to 5';
  }
  if (a?.twelfth_year !== undefined) {
    const y = Number(a.twelfth_year);
    if (Number.isInteger(y) && y >= 1980 && y <= now.getUTCFullYear() + 1) {
      academic.twelfth_year = y;
      academicChanged = true;
    } else rejected.twelfth_year = 'the year they finished Class 12';
  }
  if (a?.completed_grade !== undefined) {
    const g = String(a.completed_grade).trim().toLowerCase().replace(/^(\d+)$/, '$1th');
    if (g === '10th' || g === '12th') {
      academic.completed_grade = g;
      academicChanged = true;
    } else rejected.completed_grade = '10th or 12th';
  }
  if (academicChanged) patch.academic_data = academic;

  if (a?.exam_year !== undefined) {
    const y = Number(a.exam_year);
    if (isPlausibleStatedExamYear(y, now)) patch.target_exam_year = y;
    else rejected.exam_year = 'a coming exam year, for example 2027';
  }
  if (a?.course !== undefined) {
    const c = String(a.course).trim().toLowerCase();
    if (COURSES[c]) {
      patch.interest_course = c;
      if (c === 'not_sure') {
        patch.fee_structure_id = null;
        patch.fee_source = null;
      }
    } else rejected.course = 'nata, jee_paper2, both or not_sure';
  }

  let programme: ProgrammeId | null = null;
  if (a?.programme !== undefined) {
    const p = String(a.programme).trim().toLowerCase() as ProgrammeId;
    if (PROGRAMMES.includes(p)) programme = p;
    else rejected.programme = 'crash, 1-year or 2-year';
  }

  let pincode: string | null = null;
  if (a?.pincode !== undefined) {
    const p = String(a.pincode).replace(/\s/g, '');
    if (/^[1-9]\d{5}$/.test(p)) pincode = p;
    else rejected.pincode = 'a 6-digit Indian PIN code';
  }

  return { patch, rejected, programme, pincode };
}

/**
 * What the application still needs before it can be submitted, in the order
 * the form asks. The verified phone and the terms are not here: the card asks
 * for those itself.
 */
export function applicationGaps(row: ApplicationRow | null): string[] {
  const r = row ?? {};
  const ad = (r.academic_data ?? {}) as Record<string, unknown>;
  const gaps: string[] = [];
  if (!r.first_name || r.first_name.trim().length < 2) gaps.push('student name');
  if (!r.father_name || r.father_name.trim().length < 2) gaps.push("father's name");
  if (!r.applicant_category) gaps.push('what they are studying now');
  switch (r.applicant_category) {
    case 'school_student':
      if (!ad.current_class) gaps.push('class');
      if (!ad.school_name) gaps.push('school name');
      if (!ad.board) gaps.push('school board');
      break;
    case 'diploma_student':
      if (!ad.college_name) gaps.push('college name');
      if (!ad.department) gaps.push('department');
      if (!ad.completed_grade) gaps.push('whether they joined the diploma after 10th or 12th');
      break;
    case 'college_student':
      if (!ad.college_name) gaps.push('college name');
      if (!ad.department) gaps.push('department');
      if (!ad.year_of_study) gaps.push('year of study');
      if (!ad.twelfth_year) gaps.push('year they finished Class 12');
      break;
    case 'working_professional':
      if (!ad.twelfth_year) gaps.push('year they finished Class 12');
      break;
  }
  if (!r.target_exam_year) gaps.push('exam year');
  if (!r.interest_course) gaps.push('course (NATA, JEE Paper 2 or both)');
  else if (r.interest_course !== 'not_sure' && !r.fee_structure_id) gaps.push('programme (crash course, 1-year or 2-year)');
  if (!r.pincode || !r.city) gaps.push('PIN code');
  if (!r.date_of_birth) gaps.push('date of birth');
  return gaps;
}

function studiesLabel(r: ApplicationRow): string | null {
  const ad = (r.academic_data ?? {}) as Record<string, unknown>;
  switch (r.applicant_category) {
    case 'school_student': {
      const cls = CLASS_LABEL[String(ad.current_class ?? '')];
      const board = BOARDS[String(ad.board ?? '')];
      return [cls, ad.school_name, board].filter(Boolean).join(', ') || 'School';
    }
    case 'diploma_student':
      return ['Diploma', ad.department, ad.college_name].filter(Boolean).join(', ');
    case 'college_student':
      return [ad.year_of_study ? `College, year ${ad.year_of_study}` : 'College', ad.department, ad.college_name].filter(Boolean).join(', ');
    case 'working_professional':
      return 'Working';
    default:
      return null;
  }
}

/** "4 Aug 2008" from 2008-08-04, without a time zone shift. */
export function formatDob(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Label/value rows of what is saved, for the card and the prompt. `programmeLabel` comes from the fee structure. */
export function applicationSummary(r: ApplicationRow, programmeLabel?: string | null): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) rows.push({ label, value });
  };
  add('Student', r.first_name);
  add("Father's name", r.father_name);
  add('Studying now', studiesLabel(r));
  add('Exam year', r.target_exam_year ? String(r.target_exam_year) : null);
  add('Course', r.interest_course ? COURSES[r.interest_course] ?? r.interest_course : null);
  add('Programme', programmeLabel ?? null);
  add('Lives in', r.city ? [r.city, r.state].filter(Boolean).join(', ') + (r.pincode ? ` (${r.pincode})` : '') : r.pincode);
  add('Date of birth', r.date_of_birth ? formatDob(r.date_of_birth) : null);
  return rows;
}

/**
 * The /api/application body that submits this draft, the same keys the
 * form's buildSubmitPayload sends. The route checks the phone against the
 * account's verified one itself.
 */
export function draftToSubmitBody(r: ApplicationRow): Record<string, unknown> {
  const body: Record<string, unknown> = {
    status: 'submitted',
    form_step_completed: 3,
    first_name: r.first_name,
    father_name: r.father_name,
    email: r.email || undefined,
    phone: r.phone || undefined,
    date_of_birth: r.date_of_birth || undefined,
    gender: r.gender || undefined,
    country: r.country || 'IN',
    pincode: r.pincode || undefined,
    city: r.city || undefined,
    district: r.district || undefined,
    state: r.state || undefined,
    location_source: r.pincode ? 'pincode' : undefined,
    applicant_category: r.applicant_category || undefined,
    academic_data: r.academic_data || undefined,
    target_exam_year: r.target_exam_year || undefined,
    interest_course: r.interest_course || undefined,
    fee_structure_id: r.fee_structure_id || undefined,
    fee_source: r.fee_structure_id ? r.fee_source || 'standard' : undefined,
    learning_mode: r.learning_mode || 'hybrid',
  };
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null));
}

/** The programme for a fee structure, by how long it runs: 3 months crash, 12 one year, 24 two years. */
export function programmeOfDuration(programType: string, duration: string | null): ProgrammeId | null {
  if (programType === 'crash_course') return 'crash';
  const months = Number((duration ?? '').match(/\d+/)?.[0] ?? NaN);
  if (months === 12) return '1-year';
  if (months === 24) return '2-year';
  return null;
}
