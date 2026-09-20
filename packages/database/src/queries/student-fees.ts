/**
 * Setting a student's fee, from one place.
 *
 * WHY THIS EXISTS. Until now the only screen that could write a complete fee sat
 * inside the "approve application" action, so it could never be reached for a
 * student who has no application at all. On prod that described 38 active
 * students, enrolled between March and August 2026, created by staff without a
 * direct enrolment link and without a form. Between them they had zero payment
 * rows, zero instalment rows and no fee figure of any kind, while their teachers
 * were already teaching them.
 *
 * The other half of the problem was the Nexus profile wizard asking the STUDENT
 * to confirm the fee and report payments. A student does not know their own fee,
 * so that step has been removed. Money is set here, by staff, and nowhere else.
 *
 * WHICH NUMBER IS TRUE (mirrors apps/nexus/src/lib/student-finance.ts):
 *
 *   lead_profiles.final_fee     the contracted total. CANONICAL.
 *   payments where status=paid  what actually arrived. CANONICAL.
 *   student_profiles.*          a denormalised cache, known to drift.
 *
 * So this writes lead_profiles first and treats student_profiles as a cache it
 * refreshes afterwards, never as an input.
 *
 * Both the admin dialog and the one-off spreadsheet backfill call
 * `setStudentFees`. Two code paths writing money would drift within a month.
 */

import { recordUserHistory } from './crm';

/** The eleven fields that decide what a student owes. */
export interface StudentFeeInput {
  assigned_fee?: number | null;
  discount_amount?: number | null;
  final_fee?: number | null;
  full_payment_discount?: number | null;
  allowed_payment_modes?: 'full_only' | 'full_and_installment' | null;
  payment_scheme?: 'full' | 'installment' | null;
  installment_1_amount?: number | null;
  installment_2_amount?: number | null;
  installment_2_due_days?: number | null;
  /** YYYY-MM-DD */
  payment_deadline?: string | null;
  coupon_code?: string | null;
}

export const STUDENT_FEE_FIELDS: (keyof StudentFeeInput)[] = [
  'assigned_fee',
  'discount_amount',
  'final_fee',
  'full_payment_discount',
  'allowed_payment_modes',
  'payment_scheme',
  'installment_1_amount',
  'installment_2_amount',
  'installment_2_due_days',
  'payment_deadline',
  'coupon_code',
];

/** Money already in hand. Becomes a paid `payments` row, never a fee column. */
export interface CollectedInput {
  amount: number;
  /** YYYY-MM-DD or an ISO timestamp. Defaults to now. */
  paidAt?: string | null;
  /** bank_transfer | upi_direct | cash | manual. Defaults to manual. */
  method?: string | null;
  reference?: string | null;
}

export interface SetStudentFeesOptions {
  userId: string;
  fees: StudentFeeInput;
  collected?: CollectedInput | null;
  /** Staff member responsible, for the audit trail. */
  adminId?: string | null;
  /** Work everything out and report it, but write nothing. */
  dryRun?: boolean;
}

export interface SetStudentFeesResult {
  userId: string;
  name: string | null;
  applied: boolean;
  leadProfileId: string | null;
  createdLead: boolean;
  /** Only the fields that actually move, as { before, after }. */
  changes: Record<string, { before: unknown; after: unknown }>;
  payment: { id: string | null; amount: number; created: boolean; reason?: string } | null;
  warnings: string[];
}

export class StudentFeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudentFeeError';
  }
}

const MONEY_FIELDS: (keyof StudentFeeInput)[] = [
  'assigned_fee',
  'discount_amount',
  'final_fee',
  'full_payment_discount',
  'installment_1_amount',
  'installment_2_amount',
];

/**
 * A receipt prefix of its own, so a backfilled payment can always be told apart
 * from money that came through Razorpay or a direct enrolment link, and so
 * re-running the backfill can recognise its own rows instead of duplicating them.
 */
export const BACKFILL_RECEIPT_PREFIX = 'NR-BF-';

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Two numbers are the same rupee once rounding is allowed for. */
function sameMoney(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.01;
}

/**
 * Reject what cannot be true, and warn about what is merely odd.
 *
 * Throwing beats warning for arithmetic that contradicts itself: a final_fee
 * that does not equal assigned minus discount means one of the three numbers is
 * a typo, and guessing which would write the wrong balance to a real student.
 */
export function validateFees(
  fees: StudentFeeInput,
  collected?: CollectedInput | null,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of MONEY_FIELDS) {
    const v = fees[field];
    if (v === undefined || v === null) continue;
    const n = num(v);
    if (n === null) errors.push(`${field} is not a number.`);
    else if (n < 0) errors.push(`${field} cannot be negative.`);
  }

  const assigned = num(fees.assigned_fee);
  const discount = num(fees.discount_amount) ?? 0;
  const final = num(fees.final_fee);

  if (assigned !== null && final !== null) {
    const expected = assigned - discount;
    if (!sameMoney(expected, final)) {
      errors.push(
        `final_fee (${final}) does not equal assigned_fee minus discount (${assigned} - ${discount} = ${expected}).`,
      );
    }
  }

  const i1 = num(fees.installment_1_amount);
  const i2 = num(fees.installment_2_amount);
  if (i1 !== null && i2 !== null && final !== null && !sameMoney(i1 + i2, final)) {
    warnings.push(
      `Instalments add up to ${i1 + i2}, but the final fee is ${final}. Left as given.`,
    );
  }
  if (fees.payment_scheme === 'installment' && i1 === null && i2 === null) {
    warnings.push('Scheme is instalment but no instalment amounts were given.');
  }
  if (
    fees.allowed_payment_modes === 'full_only' &&
    fees.payment_scheme === 'installment'
  ) {
    errors.push('Scheme is instalment but the student is only allowed to pay in full.');
  }
  if (
    fees.allowed_payment_modes &&
    !['full_only', 'full_and_installment'].includes(fees.allowed_payment_modes)
  ) {
    errors.push('allowed_payment_modes must be full_only or full_and_installment.');
  }
  if (fees.payment_scheme && !['full', 'installment'].includes(fees.payment_scheme)) {
    errors.push('payment_scheme must be full or installment.');
  }
  if (fees.payment_deadline && !/^\d{4}-\d{2}-\d{2}$/.test(fees.payment_deadline)) {
    errors.push('payment_deadline must be YYYY-MM-DD.');
  }

  const paid = collected ? num(collected.amount) : null;
  if (collected) {
    if (paid === null || paid < 0) errors.push('Collected amount is not a valid number.');
    else if (final !== null && paid - final > 0.01) {
      // Not an error: overpayment and refunds are real. But it must be visible.
      warnings.push(`Collected (${paid}) is more than the final fee (${final}).`);
    }
  }

  return { errors, warnings };
}

/**
 * Set a student's fee, creating the application row if they never had one.
 *
 * Order matters. lead_profiles is canonical so it is written first; if the
 * payment insert then fails the student still has a correct contracted total,
 * which is the more damaging of the two to be missing. Every write checks its
 * error rather than discarding it: the direct-enrolment flow discarded one and
 * silently wrote 0 of 59 payment rows for months.
 */
export async function setStudentFees(
  options: SetStudentFeesOptions,
  supabase: any,
): Promise<SetStudentFeesResult> {
  const { userId, fees, collected, adminId, dryRun } = options;

  const { errors, warnings } = validateFees(fees, collected);
  if (errors.length) throw new StudentFeeError(errors.join(' '));

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, user_type, is_alumni')
    .eq('id', userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) throw new StudentFeeError('No such user.');

  const { data: lead, error: leadError } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (leadError) throw leadError;

  // Only the fields actually supplied. An absent key must leave the stored value
  // alone, or a spreadsheet with blank columns would wipe fees set elsewhere.
  const updates: Record<string, unknown> = {};
  const changes: SetStudentFeesResult['changes'] = {};
  for (const field of STUDENT_FEE_FIELDS) {
    const raw = fees[field];
    if (raw === undefined) continue;
    const value =
      raw === null || raw === ''
        ? null
        : MONEY_FIELDS.includes(field) || field === 'installment_2_due_days'
          ? num(raw)
          : raw;
    const before = lead ? lead[field] ?? null : null;
    const beforeComparable = typeof before === 'string' && num(before) !== null && value !== null && typeof value === 'number'
      ? num(before)
      : before;
    if (beforeComparable === value) continue;
    updates[field] = value;
    changes[field] = { before: beforeComparable, after: value };
  }

  const finalFee = num(fees.final_fee) ?? num(lead?.final_fee);
  const collectedAmount = collected ? num(collected.amount) ?? 0 : 0;

  // Has this student already had a backfilled payment recorded? Re-running the
  // spreadsheet must not double-count money.
  let existingBackfill: any = null;
  if (collected && collectedAmount > 0) {
    const { data: prior, error: priorError } = await supabase
      .from('payments')
      .select('id, amount, receipt_number')
      .eq('user_id', userId)
      .like('receipt_number', `${BACKFILL_RECEIPT_PREFIX}%`)
      .limit(1);
    if (priorError) throw priorError;
    existingBackfill = prior?.[0] ?? null;
  }

  const result: SetStudentFeesResult = {
    userId,
    name: user.name ?? null,
    applied: false,
    leadProfileId: lead?.id ?? null,
    // Known before any write, so the dry run can say "this creates an
    // application record" instead of springing it on staff after the fact.
    createdLead: !lead,
    changes,
    payment:
      collected && collectedAmount > 0
        ? {
            id: existingBackfill?.id ?? null,
            amount: collectedAmount,
            created: false,
            ...(existingBackfill
              ? { reason: `A backfilled payment of ${existingBackfill.amount} already exists.` }
              : {}),
          }
        : null,
    warnings: [...warnings],
  };

  if (user.is_alumni) {
    result.warnings.push('This student has already graduated.');
  }

  if (dryRun) return result;

  // ── 1. lead_profiles, the canonical record ────────────────────────────────
  let leadProfileId = lead?.id ?? null;
  if (lead) {
    if (Object.keys(updates).length) {
      const { error } = await supabase
        .from('lead_profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', lead.id);
      if (error) throw error;
    }
  } else {
    // No application was ever filled in. Create the row the fee hangs off.
    // `source: 'manual'` is the honest description: a staff member entered this,
    // the student never submitted anything.
    const { data: created, error } = await supabase
      .from('lead_profiles')
      .insert({
        user_id: userId,
        ...updates,
        source: 'manual',
        status: user.user_type === 'student' ? 'enrolled' : 'submitted',
      })
      .select('id')
      .single();
    if (error) throw error;
    leadProfileId = created.id;
    result.leadProfileId = leadProfileId;
  }

  // ── 2. the payment, if money was collected ────────────────────────────────
  let studentProfileId: string | null = null;
  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  studentProfileId = studentProfile?.id ?? null;

  if (collected && collectedAmount > 0 && !existingBackfill) {
    const receiptNumber = `${BACKFILL_RECEIPT_PREFIX}${Date.now().toString(36).toUpperCase()}`;
    const paidAt = collected.paidAt
      ? /^\d{4}-\d{2}-\d{2}$/.test(collected.paidAt)
        ? `${collected.paidAt}T00:00:00+05:30`
        : collected.paidAt
      : new Date().toISOString();
    // `description`, NOT `notes`. payments has no notes column, and the last
    // code that assumed otherwise silently wrote nothing for months.
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        student_profile_id: studentProfileId,
        lead_profile_id: leadProfileId,
        amount: collectedAmount,
        currency: 'INR',
        status: 'paid',
        payment_method: collected.method || 'manual',
        receipt_number: receiptNumber,
        paid_at: paidAt,
        description:
          'Recorded by the office for a student enrolled before the application form existed.' +
          (collected.reference ? ` Reference: ${collected.reference}` : ''),
      })
      .select('id')
      .single();
    if (error) throw error;
    result.payment = { id: payment.id, amount: collectedAmount, created: true };
  }

  // ── 3. refresh the student_profiles cache ─────────────────────────────────
  // Read the real total from paid payments rather than trusting the input, so
  // the cache reflects what the canonical tables now say.
  if (studentProfileId && finalFee !== null) {
    const { data: paidRows, error: paidError } = await supabase
      .from('payments')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'paid');
    if (paidError) throw paidError;
    const paidTotal = (paidRows || []).reduce(
      (sum: number, row: any) => sum + (num(row.amount) ?? 0),
      0,
    );
    const { error } = await supabase
      .from('student_profiles')
      .update({
        total_fee: finalFee,
        fee_paid: paidTotal,
        fee_due: Math.max(0, finalFee - paidTotal),
        payment_status: paidTotal >= finalFee ? 'paid' : paidTotal > 0 ? 'partial' : 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentProfileId);
    if (error) throw error;
  } else if (!studentProfileId) {
    result.warnings.push(
      'No student_profiles row, so the fee cache was not refreshed. The canonical figures are correct.',
    );
  }

  // ── 4. audit ──────────────────────────────────────────────────────────────
  if (adminId && (Object.keys(changes).length || result.payment?.created)) {
    await recordUserHistory(
      supabase,
      userId,
      'lead_profile.fees',
      Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.before])),
      {
        ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.after])),
        ...(result.payment?.created ? { collected: result.payment.amount } : {}),
      },
      adminId,
    );
  }

  result.applied = true;
  return result;
}
