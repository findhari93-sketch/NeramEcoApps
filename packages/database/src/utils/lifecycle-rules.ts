/**
 * The lifecycle rules in TypeScript, for screens and tests.
 *
 * user_lifecycle_view (migration 20261010090100) is the source of truth and
 * derives these in SQL. This file mirrors the same CASE expressions so the UI can
 * explain a stage ("why is this person 'paused'?") and so the rules are unit
 * tested. Change both together, like computePipelineStage in queries/crm.ts.
 *
 * Nothing here decides access. Dormancy and engagement are signals only.
 */

import type { EngagementState, LifecycleStage } from '../types';

export interface LifecycleInput {
  is_alumni?: boolean | null;
  lifecycle_status?: string | null;
  is_disabled?: boolean | null;
  /** Active student enrolment in a live classroom. */
  has_live_enrollment?: boolean;
  participation_status?: string | null;
  dormant_source?: string | null;
  nexus_entered_at?: string | null;
  has_student_profile?: boolean;
  application_status?: string | null;
  has_lead_profile?: boolean;
  phone_verified?: boolean | null;
  demo_registration_count?: number | null;
}

const APPLICANT = ['submitted', 'under_review', 'pending_verification', 'approved'];
const ENROLLED_APPLICATION = ['enrolled', 'partial_payment'];

export function deriveAccountStatus(u: Pick<LifecycleInput, 'is_disabled'>): 'active' | 'deactivated' {
  return u.is_disabled ? 'deactivated' : 'active';
}

export function deriveLifecycleStage(u: LifecycleInput): LifecycleStage {
  if (u.is_alumni) return 'alumni';
  if (u.lifecycle_status === 'archived') return 'archived';
  if (u.has_live_enrollment && u.participation_status === 'dormant' && u.dormant_source === 'staff') return 'paused';
  if (u.has_live_enrollment && u.nexus_entered_at) return 'active_student';
  if (u.has_live_enrollment || u.has_student_profile || ENROLLED_APPLICATION.includes(u.application_status ?? '')) {
    return 'enrolled';
  }
  if (APPLICANT.includes(u.application_status ?? '')) return 'applicant';
  if (u.has_lead_profile || u.phone_verified || (u.demo_registration_count ?? 0) > 0) return 'lead';
  return 'prospect';
}

const DAY = 24 * 60 * 60 * 1000;

export function deriveEngagement(
  lastActivityAt: string | null | undefined,
  createdAt: string | null | undefined,
  now: Date = new Date(),
): EngagementState {
  const t = now.getTime();
  if (createdAt && t - new Date(createdAt).getTime() < 7 * DAY) return 'new';
  if (!lastActivityAt) return 'dormant';
  const age = t - new Date(lastActivityAt).getTime();
  if (age <= 7 * DAY) return 'engaged';
  if (age <= 30 * DAY) return 'low';
  if (age <= 90 * DAY) return 'inactive';
  return 'dormant';
}

export type ExamYearSource = 'batch' | 'stated' | 'signup';

/** India is UTC+5:30 with no daylight saving. */
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * The exam a person is preparing for. Mirrors exam_year / exam_year_source in
 * user_lifecycle_view (migration 20261018090000):
 *   1. their batch: academic_year '2026-27' means the 2027 exam
 *   2. the year they gave (target_year)
 *   3. their sign-up date: a season runs 1 July to 30 June, India time, so a
 *      sign-up on 30 June 2026 is the 2026 exam and one on 1 July 2026 is 2027.
 *      Source 'signup' means the year is an estimate.
 */
export function deriveExamYear(u: {
  academicYear?: string | null;
  targetYear?: number | null;
  createdAt?: string | null;
}): { year: number | null; source: ExamYearSource | null } {
  const batch = u.academicYear?.match(/^(\d{4})-\d{2}$/);
  if (batch) return { year: Number(batch[1]) + 1, source: 'batch' };
  if (u.targetYear) return { year: u.targetYear, source: 'stated' };
  if (!u.createdAt) return { year: null, source: null };
  const ist = new Date(new Date(u.createdAt).getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear() + (ist.getUTCMonth() >= 6 ? 1 : 0);
  return { year, source: 'signup' };
}

/** Batch code for an exam year: 2027 -> '2026-27'. */
export function batchCodeForExamYear(year: number): string {
  return `${year - 1}-${String(year % 100).padStart(2, '0')}`;
}

/** Exam year for a batch code: '2026-27' -> 2027. Null for anything else. */
export function examYearForBatchCode(code: string | null | undefined): number | null {
  const m = code?.match(/^(\d{4})-\d{2}$/);
  return m ? Number(m[1]) + 1 : null;
}

/**
 * Activity groups for the People page. They fold the five engagement states
 * into the three questions staff ask: still around, going quiet, or gone.
 */
export type ActivityGroup = 'recent' | 'quiet' | 'gone';

export const ACTIVITY_GROUPS: Record<ActivityGroup, { label: string; hint: string; states: EngagementState[] }> = {
  recent: {
    label: 'Active in last 30 days',
    hint: 'Joined, signed in, used a tool or did anything else in the last 30 days.',
    states: ['new', 'engaged', 'low'],
  },
  quiet: {
    label: 'Quiet 1 to 3 months',
    hint: 'Last did something 1 to 3 months ago. Worth a call or message.',
    states: ['inactive'],
  },
  gone: {
    label: 'No activity 3+ months',
    hint: 'Nothing for more than 3 months, or never did anything after signing up.',
    states: ['dormant'],
  },
};

export function activityGroupOf(engagement: string | null | undefined): ActivityGroup {
  if (engagement === 'inactive') return 'quiet';
  if (engagement === 'new' || engagement === 'engaged' || engagement === 'low') return 'recent';
  return 'gone';
}

/**
 * Plain-words stage names for the admin People page. LIFECYCLE_STAGE_LABELS
 * below stays as is for Nexus and User 360.
 */
export const PEOPLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  prospect: 'Signed up only',
  lead: 'Shared phone or form',
  applicant: 'Applied',
  enrolled: 'Enrolled, not started',
  active_student: 'Studying',
  paused: 'Paused',
  alumni: 'Alumni',
  archived: 'Archived',
};

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  prospect: 'Prospect',
  lead: 'Lead',
  applicant: 'Applicant',
  enrolled: 'Enrolled',
  active_student: 'Active student',
  paused: 'Paused',
  alumni: 'Alumni',
  archived: 'Archived',
};

/** One sentence per stage, for tooltips and the User 360 header. */
export const LIFECYCLE_STAGE_MEANINGS: Record<LifecycleStage, string> = {
  prospect: 'Signed up, but has not filled the form, verified a phone or booked a demo.',
  lead: 'Has shown interest: a form, a verified phone or a demo booking.',
  applicant: 'Has submitted an application that staff have not closed.',
  enrolled: 'Enrolled or paid, but has not opened Nexus yet.',
  active_student: 'Enrolled in a live classroom and has opened Nexus.',
  paused: 'A staff member paused this student. Access is unchanged.',
  alumni: 'Graduated. Nexus access has ended.',
  archived: 'Moved out of the active CRM list by staff. Sign-in still works.',
};

export const ENGAGEMENT_LABELS: Record<EngagementState, string> = {
  new: 'New this week',
  engaged: 'Active this week',
  low: 'Quiet 1 to 4 weeks',
  inactive: 'Quiet 1 to 3 months',
  dormant: 'No activity for 3 months',
};

export const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  sign_in: 'Signed in',
  nexus_sign_in: 'Opened Nexus',
  app_event: 'Used the app',
  tool: 'Used a tool',
  drawing: 'Submitted a drawing',
  class_attended: 'Attended a class',
  payment: 'Made a payment',
  profile_update: 'Updated their profile',
  replied_to_call: 'Spoke to staff',
};

const MISSING_LABELS: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  phone_verified: 'Phone not verified',
  email: 'Email',
  city: 'City',
  target_year: 'Target year',
  target_exam: 'Target exam',
};

/** 6 checks; each missing item costs one sixth. */
export function profileCompleteness(missing: string[] | null | undefined): { percent: number; items: string[] } {
  const items = (missing || []).map((m) => MISSING_LABELS[m] || m);
  const percent = Math.round(((6 - Math.min(6, items.length)) / 6) * 100);
  return { percent, items };
}
