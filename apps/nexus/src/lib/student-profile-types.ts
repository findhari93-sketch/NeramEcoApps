/**
 * The wire contract between the three student-profile routes and the page.
 *
 * Types only, no runtime code, so importing this into a client component costs
 * nothing at build time.
 *
 * The split into three payloads is not cosmetic. `StudentProfileCore` is the
 * only blocking fetch; `StudentFinancePayload` exists so the commercial columns
 * live behind their own capability assert; `StudentPerformancePayload` is the
 * expensive one and must never delay a teacher seeing a phone number. See the
 * header of student-finance.ts for why the fee gate is a separate route rather
 * than a flag on this one.
 */

import type {
  AttendanceSummary,
  ClassAttendanceView,
} from './parent-attendance';
import type { ParentCatchupRollup } from './parent-catchup';
import type { ParentTestSummary, ParentTestWithClass } from './parent-tests';
import type { ClassStandingResult } from './class-standing';

// ─── Core bundle ─────────────────────────────────────────────────────────────

export interface ProfileStudent {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  personal_email: string | null;
  phone: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  gender: string | null;
  ms_oid: string | null;
  linked_classroom_email: string | null;
  academic_year: string | null;
  student_program: string | null;
  lifecycle_status: string | null;
  is_alumni: boolean | null;
  photo_status: string | null;
  last_login_at: string | null;
  nexus_first_login_at: string | null;
  nexus_last_login_at: string | null;
}

export interface ProfileEnrollment {
  enrolled_at: string | null;
  batch_id: string | null;
  /** nexus_enrollments.current_standard, the study stage. */
  study_stage: string | null;
  study_stage_source: string | null;
  study_stage_set_at: string | null;
  participation_status: 'active' | 'dormant';
  dormant_since: string | null;
  dormant_reason: string | null;
  /** Whether the study stage and the exam year agree. From pairStatus(). */
  pair_status: string | null;
}

/** From student_profiles. Enrolment admin, never fees: see student-finance.ts. */
export interface ProfileStudentRecord {
  student_id: string | null;
  enrollment_date: string | null;
  course_id: string | null;
  ms_teams_email: string | null;
  notes: string | null;
  last_activity_at: string | null;
}

/** The application form. null for every student a staff member added by hand. */
export interface ProfileApplication {
  application_number: string | null;
  status: string | null;
  form_step_completed: number | null;
  form_completed_at: string | null;
  created_at: string | null;
  applicant_category: string | null;
  target_exam_year: number | null;
  school_type: string | null;
  learning_mode: string | null;
  interest_course: string | null;
  hybrid_learning_accepted: boolean | null;
  phone_verified: boolean | null;
  phone_verified_at: string | null;
  /** Raw jsonb. Rendered through describeAcademicData, which never throws. */
  academic_data: unknown;
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  pincode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_source: string | null;
}

/**
 * Parent and guardian details, merged from three tables.
 *
 * `source` names which table each block came from, because
 * post_enrollment_details covers only about a fifth of the roster and a card
 * that silently falls back reads as missing data when the data exists
 * elsewhere.
 */
export interface ProfileGuardian {
  source: 'post_enrollment' | 'application' | 'student_profile' | null;
  father_name: string | null;
  father_phone: string | null;
  father_occupation: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  mother_occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  /** Safety information, visible to every staff member by deliberate choice. */
  blood_group: string | null;
  medical_conditions: string | null;
  /** Already masked server side. The raw value never leaves the database here. */
  aadhaar_masked: string | null;
  aadhaar_verified: boolean | null;
}

export interface ProfileParentAccess {
  linked: boolean;
  relationship: string | null;
  is_primary: boolean | null;
  login_id: string | null;
  credential_active: boolean | null;
  last_login_at: string | null;
}

export interface ProfileDocument {
  id: string;
  category: string | null;
  title: string | null;
  file_url: string | null;
  sharepoint_web_url: string | null;
  status: string | null;
  version: number | null;
  uploaded_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
}

export interface ProfileChecklistItem {
  id: string;
  title: string | null;
  topicTitle: string | null;
  topicCategory: string | null;
  is_completed: boolean;
  completed_at: string | null;
}

export interface ProfileProgress<T> {
  completed: number;
  total: number;
  /**
   * Incomplete items only by default, so a large classroom does not ship 100KB
   * of JSON to a phone. `truncated` says whether anything was left out.
   */
  items: T[];
  truncated: boolean;
}

export type TimelineKind =
  | 'enrollment'
  | 'classification'
  | 'document'
  | 'login'
  | 'application'
  | 'parent_account'
  | 'payment';

export interface ProfileTimelineEvent {
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
}

export interface StudentProfileCore {
  student: ProfileStudent;
  enrollment: ProfileEnrollment;
  record: ProfileStudentRecord | null;
  classroom: { id: string; name: string | null };
  application: ProfileApplication | null;
  guardian: ProfileGuardian;
  parentAccess: ProfileParentAccess;
  documents: ProfileDocument[];
  checklist: ProfileProgress<ProfileChecklistItem>;
  topics: { completed: number; total: number };
  timeline: ProfileTimelineEvent[];
  currentBatch: string | null;
  /** What this caller may additionally fetch. Drives the lazy calls, not the gate. */
  capabilities: { finance: boolean };
}

// ─── Finance bundle (admin and manager only) ─────────────────────────────────

export interface ProfilePayment {
  id: string;
  amount: number | null;
  status: string | null;
  paid_at: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  receipt_url: string | null;
  installment_number: number | null;
  payer_name: string | null;
  payer_relationship: string | null;
}

export interface ProfileInstallment {
  installment_number: number | null;
  amount: number | null;
  due_date: string | null;
  status: string | null;
  paid_at: string | null;
}

export interface StudentFinancePayload {
  /** Contracted total. null when no fee agreement exists, never 0. */
  agreed: number | null;
  paid: number;
  balance: number | null;
  nextDue: { date: string | null; source: string | null };
  scheme: {
    payment_scheme: string | null;
    assigned_fee: number | null;
    discount_amount: number | null;
    full_payment_discount: number | null;
    coupon_code: string | null;
    installment_1_amount: number | null;
    installment_2_amount: number | null;
    allowed_payment_modes: string | null;
    payment_status: string | null;
  };
  cashback: { eligible: number | null; processed: number | null };
  /** Caste and scholarship ride this gate: they decide fee eligibility. */
  scholarship: { caste_category: string | null; eligible: boolean | null };
  attribution: {
    source: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    referral_code: string | null;
  };
  payments: ProfilePayment[];
  installments: ProfileInstallment[];
  /** Non-null when the student_profiles cache disagrees with the truth. */
  cacheDisagreement: { fields: string[]; deltaRupees: number } | null;
}

// ─── Performance bundle ──────────────────────────────────────────────────────

/** One student's row out of getAssignmentEngagement. */
export interface ProfileAssignmentEngagement {
  applicable: number;
  submitted: number;
  reviewed: number;
  on_time: number;
  overdue: number;
  /** null when nothing has been marked yet. An average of no marks is not 0. */
  avg_marks_pct: number | null;
  last_submitted_at: string | null;
  days_since_last: number | null;
  status: string | null;
  is_late_joiner: boolean;
}

export interface ProfilePrepState {
  classesWithPrep: number;
  ready: number;
  blockedAttempts: number;
  unlockedViaReason: number;
  averageBestPct: number | null;
}

export interface StudentPerformancePayload {
  windowDays: number;
  classroomName: string | null;
  attendance: {
    summary: AttendanceSummary;
    /** The honest sentence. Rendered verbatim when attendanceRate is null. */
    sentence: string;
    views: ClassAttendanceView[];
  };
  assignments: ProfileAssignmentEngagement | null;
  tests: { summary: ParentTestSummary; items: ParentTestWithClass[] };
  catchup: ParentCatchupRollup;
  prep: ProfilePrepState | null;
  /** The composite. Its `score` is null for settling_in and not_enough_data. */
  classStanding: ClassStandingResult;
}
