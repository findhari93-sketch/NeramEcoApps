/**
 * The commercial half of a student's record, and the wall around it.
 *
 * PURE TypeScript: no Supabase, no Date.now. The loader that uses these lists
 * lives in the finance route; everything decidable without a database lives
 * here so it can be tested.
 *
 * ---------------------------------------------------------------------------
 * THE FEE GATE IS ENFORCED BY ABSENCE, NOT BY HIDING.
 *
 * A teacher must not see what a family owes. Hiding a section in the UI is not
 * a gate: the numbers still travel to the browser and sit in devtools. So the
 * column lists below are split, and the route that serves a teacher selects
 * only LEAD_PROFILE_PUBLIC_COLUMNS. The commercial columns are never named in
 * a query a teacher can reach, so Postgres is never asked for them.
 *
 * The two lists are asserted disjoint in the tests. That assertion is the real
 * regression guard on this feature: if someone later moves `final_fee` into the
 * public list to fix a rendering bug, the test fails rather than the fee
 * quietly appearing on every visiting teacher's screen.
 *
 * Identifiers live in a third list because both routes need them and they
 * carry no signal on their own.
 * ---------------------------------------------------------------------------
 *
 * WHICH TOTAL IS TRUE. Three tables hold fee numbers and they disagree.
 *
 *   lead_profiles.final_fee        the contracted total. CANONICAL.
 *   payments (status='paid')       what actually arrived. CANONICAL.
 *   student_profiles.fee_paid,     a denormalised cache, known to drift.
 *   fee_due, total_fee             NEVER rendered as a number.
 *
 * The admin CRM computes the same way (see PaymentSection.tsx), so Nexus and
 * the CRM show the same rupees. The cache is read only to detect drift, which
 * surfaces as a quiet note rather than a second total: two totals on one screen
 * is worse than one total that might be stale.
 */

// ─── Column allowlists ───────────────────────────────────────────────────────

/** Identifiers. No signal on their own, needed by both routes. */
export const LEAD_PROFILE_KEY_COLUMNS = ['id', 'user_id'] as const;

/**
 * What any staff member may see from the application form: who this student is
 * and what they are studying.
 */
export const LEAD_PROFILE_PUBLIC_COLUMNS = [
  'application_number',
  'status',
  'form_step_completed',
  'form_completed_at',
  'created_at',
  'applicant_category',
  'target_exam_year',
  'school_type',
  'learning_mode',
  'interest_course',
  'selected_course_id',
  'selected_center_id',
  'hybrid_learning_accepted',
  'academic_data',
  'phone_verified',
  'phone_verified_at',
  'first_name',
  'father_name',
  'parent_phone',
  'date_of_birth',
  'gender',
  'country',
  'state',
  'district',
  'city',
  'pincode',
  'address',
  'latitude',
  'longitude',
  'location_source',
] as const;

/**
 * Admin and manager only, gated on `coord.student.finance`.
 *
 * Three groups, and the reason each is here:
 *   money            what was agreed, discounted, scheduled and cashed back
 *   scholarship      caste_category and scholarship_* decide fee eligibility,
 *                    so they are commercial, not academic
 *   attribution      utm_*, gclid, wbraid, referral_code and source are
 *                    marketing data about how we acquired this family
 */
export const LEAD_PROFILE_FINANCE_COLUMNS = [
  'assigned_fee',
  'discount_amount',
  'final_fee',
  'full_payment_discount',
  'coupon_code',
  'admin_coupon_id',
  'payment_scheme',
  'payment_deadline',
  'installment_reminder_date',
  'installment_1_amount',
  'installment_2_amount',
  'installment_2_due_days',
  'allowed_payment_modes',
  'payment_recommendation',
  'total_cashback_eligible',
  'total_cashback_processed',
  'caste_category',
  'scholarship_eligible',
  'scholarship_opened_at',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'referral_code',
  'gclid',
  'wbraid',
] as const;

export const STUDENT_PROFILE_KEY_COLUMNS = ['id', 'user_id'] as const;

export const STUDENT_PROFILE_PUBLIC_COLUMNS = [
  'student_id',
  'enrollment_date',
  'batch_id',
  'course_id',
  'ms_teams_id',
  'ms_teams_email',
  'parent_contact',
  'emergency_contact',
  'notes',
  'lessons_completed',
  'assignments_completed',
  'total_watch_time',
  'last_activity_at',
] as const;

export const STUDENT_PROFILE_FINANCE_COLUMNS = [
  'payment_status',
  'total_fee',
  'fee_paid',
  'fee_due',
  'next_payment_date',
] as const;

/** Build a PostgREST select string from one or more allowlists. */
export function selectColumns(
  ...lists: ReadonlyArray<readonly string[]>
): string {
  return lists.flat().join(', ');
}

// ─── Fee math ────────────────────────────────────────────────────────────────

/**
 * Only `paid` counts. `pending`, `failed`, `refunded` and everything else is
 * money that did not arrive, and treating any of them as received would tell an
 * admin a family is settled when they are not.
 */
export const PAID_STATUS = 'paid';

/** More than this much drift between the cache and the truth is worth showing. */
export const CACHE_DRIFT_TOLERANCE_RUPEES = 1;

export interface PaymentRow {
  amount: number | null;
  status: string | null;
  paid_at?: string | null;
}

export type NextDueSource =
  | 'student_profile'
  | 'application_deadline'
  | 'derived_installment';

export interface FeeInputs {
  /** lead_profiles.final_fee. null when there is no application on file. */
  finalFee: number | null | undefined;
  payments: PaymentRow[];
  /** student_profiles.next_payment_date */
  nextPaymentDate?: string | null;
  /** lead_profiles.payment_deadline */
  paymentDeadline?: string | null;
  /** nexus_enrollments.enrolled_at or student_profiles.enrollment_date */
  enrollmentDate?: string | null;
  /** lead_profiles.installment_2_due_days */
  installment2DueDays?: number | null;
  /** The denormalised cache, read ONLY to detect drift. */
  cache?: {
    fee_paid?: number | null;
    fee_due?: number | null;
    total_fee?: number | null;
  } | null;
}

export interface FeeSummary {
  /** The contracted total, or null when no fee agreement exists. Never 0. */
  agreed: number | null;
  /** Sum of payments that actually arrived. Always a number, possibly 0. */
  paid: number;
  /** agreed minus paid, clamped at 0. null when `agreed` is null. */
  balance: number | null;
  nextDue: { date: string | null; source: NextDueSource | null };
  /** Non-null when the student_profiles cache disagrees with the truth. */
  cacheDisagreement: { fields: string[]; deltaRupees: number } | null;
}

/**
 * Add `days` to an ISO date and return YYYY-MM-DD.
 * Pure: operates on the value passed in, never on the current time.
 */
function addDays(iso: string, days: number): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The one place fee numbers are decided. See the file header for why
 * `student_profiles` is not trusted for the totals.
 */
export function computeFeeSummary(input: FeeInputs): FeeSummary {
  const paid = (input.payments || [])
    .filter((p) => p.status === PAID_STATUS)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // A missing agreement stays null all the way to the UI. Collapsing it to 0
  // would render a fake settled balance for every staff-added student.
  const agreed =
    input.finalFee === null || input.finalFee === undefined || Number.isNaN(input.finalFee)
      ? null
      : Number(input.finalFee);

  const balance = agreed === null ? null : Math.max(0, agreed - paid);

  // Three sources, in descending order of how directly a human set them. The
  // UI names which one it used, so nobody mistakes a derived date for a promise.
  let nextDue: FeeSummary['nextDue'] = { date: null, source: null };
  if (input.nextPaymentDate) {
    nextDue = { date: input.nextPaymentDate, source: 'student_profile' };
  } else if (input.paymentDeadline) {
    nextDue = { date: input.paymentDeadline, source: 'application_deadline' };
  } else if (input.enrollmentDate && input.installment2DueDays) {
    const derived = addDays(input.enrollmentDate, input.installment2DueDays);
    if (derived) nextDue = { date: derived, source: 'derived_installment' };
  }

  return {
    agreed,
    paid,
    balance,
    nextDue,
    cacheDisagreement: detectCacheDrift(input.cache, paid, balance),
  };
}

/**
 * Compare the denormalised cache against the computed truth.
 *
 * This is not a display path. It exists because the cache is wrong often enough
 * that an admin chasing a payment needs to know the record is being reconciled,
 * and because a silent disagreement is how the direct-enrolment payment bug
 * went unnoticed for 59 rows.
 */
function detectCacheDrift(
  cache: FeeInputs['cache'],
  paid: number,
  balance: number | null,
): FeeSummary['cacheDisagreement'] {
  if (!cache) return null;

  const fields: string[] = [];
  let delta = 0;

  if (cache.fee_paid !== null && cache.fee_paid !== undefined) {
    const d = Math.abs(Number(cache.fee_paid) - paid);
    if (d > CACHE_DRIFT_TOLERANCE_RUPEES) {
      fields.push('fee_paid');
      delta = Math.max(delta, d);
    }
  }

  if (balance !== null && cache.fee_due !== null && cache.fee_due !== undefined) {
    const d = Math.abs(Number(cache.fee_due) - balance);
    if (d > CACHE_DRIFT_TOLERANCE_RUPEES) {
      fields.push('fee_due');
      delta = Math.max(delta, d);
    }
  }

  if (fields.length === 0) return null;
  return { fields, deltaRupees: Math.round(delta) };
}
