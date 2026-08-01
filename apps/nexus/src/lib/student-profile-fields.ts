/**
 * Presentation rules for the student profile page.
 *
 * PURE TypeScript: no JSX, no Supabase, no Date.now. Everything here turns a
 * raw database value into the string a teacher reads, so the wording lives in
 * one testable place instead of being scattered across a dozen components.
 *
 * ---------------------------------------------------------------------------
 * TWO RULES THIS FILE EXISTS TO ENFORCE.
 *
 * ONE: an empty value is never a dash. `lead_profiles` is absent for every
 * student a staff member added by hand, and `post_enrollment_details` covers
 * roughly a fifth of the roster. A grid of dashes reads as "the system is
 * broken"; a sentence reads as "nobody filled this in yet", which is the truth
 * and is actionable. Callers render `absent()` or a section-level sentence.
 *
 * TWO: `academic_data` is a JSONB column with four different shapes chosen by
 * `applicant_category`. The two can disagree, because the column was written by
 * an older version of the apply form and nothing revalidates it. So the
 * discriminator NEVER trusts the category alone: it checks that the payload
 * actually looks like the shape it claims, and falls back to a raw key/value
 * list when it does not. Throwing would blank the whole profile over one bad
 * row from 2024.
 * ---------------------------------------------------------------------------
 *
 * House rule, asserted in the tests: no string here contains an em dash, a
 * double dash, or &mdash;.
 */

import type {
  ApplicantCategory,
  CasteCategory,
  LearningMode,
  LocationSource,
  SchoolType,
} from '@neram/database';

// ─── Empty states ────────────────────────────────────────────────────────────

/** The one string used wherever a single field has no value. */
export const NOT_RECORDED = 'Not recorded';

/** Section-level sentences. Used instead of an empty card or a grid of dashes. */
export const EMPTY_SENTENCE = {
  application:
    'This student was added by staff, so there is no application form on file.',
  academicData:
    'No academic background was captured on the application form.',
  guardian:
    'No parent or guardian details have been recorded for this student yet.',
  documents: 'No documents have been uploaded for this student yet.',
  payments: 'No payments have been recorded for this student.',
  feeAgreement: 'No fee agreement is on file for this student.',
  timeline: 'No activity has been recorded for this student yet.',
} as const;

/** Normalise any nullish or blank value to the single "no value" string. */
export function absent(value: unknown): string {
  if (value === null || value === undefined) return NOT_RECORDED;
  if (typeof value === 'string' && value.trim() === '') return NOT_RECORDED;
  return String(value);
}

// ─── Label maps ──────────────────────────────────────────────────────────────

export const APPLICANT_CATEGORY_LABEL: Record<ApplicantCategory, string> = {
  school_student: 'School student',
  diploma_student: 'Diploma student',
  college_student: 'College student',
  working_professional: 'Working professional',
};

export const CASTE_CATEGORY_LABEL: Record<CasteCategory, string> = {
  general: 'General',
  obc: 'OBC',
  sc: 'SC',
  st: 'ST',
  ews: 'EWS',
  other: 'Other',
};

export const LEARNING_MODE_LABEL: Record<LearningMode, string> = {
  hybrid: 'Hybrid (online with centre visits)',
  online_only: 'Online only',
};

export const SCHOOL_TYPE_LABEL: Record<SchoolType, string> = {
  private_school: 'Private school',
  government_aided: 'Government-aided school',
  government_school: 'Government school',
};

/**
 * How the address was arrived at. Shown as a caption under the location block
 * so a teacher knows whether a student typed their city or the browser guessed
 * it, which changes how much they should trust it.
 */
export const LOCATION_SOURCE_LABEL: Record<LocationSource, string> = {
  geolocation: 'Detected from the device location',
  pincode: 'Derived from the pincode',
  manual: 'Typed by the student',
};

export const BOARD_LABEL: Record<string, string> = {
  cbse: 'CBSE',
  icse: 'ICSE',
  state_tn: 'Tamil Nadu State Board',
  state_kl: 'Kerala State Board',
  state_ka: 'Karnataka State Board',
  state_ap: 'Andhra Pradesh State Board',
  igcse: 'IGCSE',
  ib: 'International Baccalaureate',
  nios: 'NIOS',
  other: 'Other',
};

/** Look up a label map, falling back to a readable version of the raw value. */
export function labelFor(
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return NOT_RECORDED;
  return map[value] ?? humanise(value);
}

/** `working_professional` becomes `Working professional`. */
export function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return NOT_RECORDED;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/**
 * Dates render in IST because the whole institution runs on it, and a class
 * that ran at 19:00 IST must not display as the previous day to anyone.
 */
const IST = 'Asia/Kolkata';

export function formatDateIN(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return NOT_RECORDED;
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  });
}

export function formatDateTimeIN(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return NOT_RECORDED;
  return new Date(ms).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: IST,
  });
}

/**
 * Rupees, with the Indian digit grouping. `null` is NOT_RECORDED and never
 * zero: on this page a missing fee agreement and a settled balance must never
 * look the same.
 */
export function formatCurrencyINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return NOT_RECORDED;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return NOT_RECORDED;
  }
  return `${value.toFixed(digits)}%`;
}

/** Groups an Indian mobile as `+91 98765 43210`, leaves anything else alone. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return value;
}

export function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return NOT_RECORDED;
  return value ? 'Yes' : 'No';
}

/**
 * Aadhaar is masked for everyone, including an admin, until they explicitly ask
 * to see it. The unmasked value is served by a separate capability-gated call
 * that writes an audit row, so this function never receives it by accident.
 */
export function maskAadhaar(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return 'Not a valid Aadhaar number';
  return `XXXX XXXX ${digits.slice(-4)}`;
}

// ─── academic_data ───────────────────────────────────────────────────────────

export type AcademicShape = 'school' | 'diploma' | 'college' | 'working';

export interface AcademicRow {
  label: string;
  value: string;
}

export interface AcademicDataView {
  /** null when we could not identify a shape and fell back to a raw list. */
  shape: AcademicShape | null;
  rows: AcademicRow[];
  /**
   * True when the payload did not match the shape its category claimed, so the
   * rows are a raw key/value dump. The UI shows a quiet caption in that case
   * rather than pretending the data is structured.
   */
  fellBack: boolean;
}

const SHAPE_FOR_CATEGORY: Record<ApplicantCategory, AcademicShape> = {
  school_student: 'school',
  diploma_student: 'diploma',
  college_student: 'college',
  working_professional: 'working',
};

/** The field whose presence proves a payload really is the shape it claims. */
const SHAPE_WITNESS: Record<AcademicShape, string[]> = {
  school: ['current_class', 'school_name', 'board'],
  diploma: ['completed_grade', 'college_name', 'department'],
  college: ['year_of_study', 'college_name', 'department'],
  working: ['twelfth_year', 'occupation', 'company'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Does this payload carry at least one field unique to the claimed shape. */
function looksLike(shape: AcademicShape, data: Record<string, unknown>): boolean {
  return SHAPE_WITNESS[shape].some(
    (key) => data[key] !== undefined && data[key] !== null && data[key] !== '',
  );
}

function row(label: string, value: unknown): AcademicRow {
  return { label, value: absent(value) };
}

/**
 * Turn `lead_profiles.academic_data` into labelled rows.
 *
 * Never throws. A payload that does not match its category, or that is a string
 * of JSON, or that is `{}`, degrades to something readable rather than blanking
 * the section. See the file header for why.
 */
export function describeAcademicData(
  applicantCategory: string | null | undefined,
  raw: unknown,
): AcademicDataView {
  let data = raw;

  // The column is jsonb, but a few historical rows hold a JSON string.
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { shape: null, rows: [], fellBack: false };
    }
  }

  if (!isRecord(data) || Object.keys(data).length === 0) {
    return { shape: null, rows: [], fellBack: false };
  }

  const claimed =
    applicantCategory && applicantCategory in SHAPE_FOR_CATEGORY
      ? SHAPE_FOR_CATEGORY[applicantCategory as ApplicantCategory]
      : null;

  // Trust the category only if the payload backs it up. Otherwise try to
  // recognise the payload on its own, and only then give up and dump it raw.
  const shape =
    claimed && looksLike(claimed, data)
      ? claimed
      : (['school', 'diploma', 'college', 'working'] as AcademicShape[]).find((s) =>
          looksLike(s, data),
        ) ?? null;

  if (shape === null) {
    return { shape: null, rows: rawRows(data), fellBack: true };
  }

  return { shape, rows: rowsFor(shape, data), fellBack: shape !== claimed };
}

function rowsFor(shape: AcademicShape, d: Record<string, unknown>): AcademicRow[] {
  switch (shape) {
    case 'school':
      return [
        row('Class', d.current_class),
        row('School', d.school_name),
        { label: 'Board', value: labelFor(BOARD_LABEL, d.board as string) },
        {
          label: 'School type',
          value: d.school_type
            ? labelFor(SCHOOL_TYPE_LABEL, d.school_type as string)
            : NOT_RECORDED,
        },
        {
          label: 'Previous percentage',
          value: formatPercent(d.previous_percentage as number, 1),
        },
      ];
    case 'diploma':
      return [
        row('College', d.college_name),
        row('Department', d.department),
        row('Completed before diploma', d.completed_grade),
        { label: 'Marks', value: formatPercent(d.marks as number, 1) },
      ];
    case 'college':
      return [
        row('College', d.college_name),
        row('Department', d.department),
        row('Year of study', d.year_of_study),
        row('Completed 12th in', d.twelfth_year),
        {
          label: '12th percentage',
          value: formatPercent(d.twelfth_percentage as number, 1),
        },
        row('Why this exam now', d.reason_for_exam),
      ];
    case 'working':
      return [
        row('Completed 12th in', d.twelfth_year),
        row('Occupation', d.occupation),
        row('Company', d.company),
      ];
  }
}

/** Last resort: show what is actually stored, labelled as best we can. */
function rawRows(d: Record<string, unknown>): AcademicRow[] {
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ({
      label: humanise(k),
      value: isRecord(v) || Array.isArray(v) ? JSON.stringify(v) : String(v),
    }));
}
