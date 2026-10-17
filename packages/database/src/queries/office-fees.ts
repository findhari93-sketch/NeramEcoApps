/**
 * The office form: a student's application details, fee plan and money received,
 * saved together. This is the path for "staff fill it in, the student checks it".
 *
 * What it adds over setStudentFees (queries/student-fees.ts), which stays for the
 * spreadsheet backfill:
 *   - a real second-installment due date, kept in payment_installments
 *   - any number of office payments, each with its own idempotency key
 *   - installments reconciled to paid, and the cache's next_payment_date set
 *   - reviewed_by stamped, so Nexus counts the row as an application
 *
 * WHICH NUMBER IS TRUE: lead_profiles.final_fee (agreed) and paid payments
 * (arrived). student_profiles is a cache this refreshes afterwards.
 */

import { recordUserHistory } from './crm';
import { StudentFeeError } from './student-fees';
import { markConfirmedCheckChanged, resolveFeeCorrectionReport } from './record-checks';
import {
  pickFeeLead,
  isStaffUnreviewedManualRow,
  buildFeeView,
  feeSignature,
  validatePlan,
  isDateKey,
  istToday,
  addDaysToKey,
  money,
  allocatePayments,
  effectiveAgreedFee,
  type FeeView,
  type FeePlanInput,
  type PaymentLineInput,
  type FeeLeadRow,
  type FeePaymentRow,
  type InstallmentRow,
} from '../utils/fee-plan';

/**
 * Application fields staff may fill in. Admin's CRM "Fill application form"
 * route uses the same list, so both write the same columns.
 */
export const STAFF_APPLICATION_FIELDS = [
  'father_name',
  'applicant_category',
  'academic_data',
  'interest_course',
  'learning_mode',
  'school_type',
  'caste_category',
  'target_exam_year',
  'city',
  'state',
  'pincode',
] as const;

export type StaffApplicationField = (typeof STAFF_APPLICATION_FIELDS)[number];

/** A receipt prefix for money the office recorded through the form. */
export const OFFICE_RECEIPT_PREFIX = 'NR-OF-';

const PAYMENT_COLUMNS =
  'id, user_id, amount, status, paid_at, created_at, installment_number, payment_method, description, receipt_number, idempotency_key';
const INSTALLMENT_COLUMNS =
  'id, lead_profile_id, installment_number, amount, due_date, status, paid_at, paid_amount, payment_id, reminder_date, reminder_sent';

export interface StudentFeeState {
  user: { id: string; name: string | null; user_type: string | null; is_alumni: boolean | null } | null;
  leads: (FeeLeadRow & Record<string, any>)[];
  lead: (FeeLeadRow & Record<string, any>) | null;
  payments: (FeePaymentRow & { idempotency_key?: string | null })[];
  installments: InstallmentRow[];
  studentProfileId: string | null;
  view: FeeView;
}

/** Everything about one student's fee, read in one go. */
export async function loadStudentFeeState(supabase: any, userId: string): Promise<StudentFeeState> {
  const [userRes, leadsRes, paymentsRes, spRes] = await Promise.all([
    supabase.from('users').select('id, name, user_type, is_alumni').eq('id', userId).maybeSingle(),
    supabase.from('lead_profiles').select('*').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('payments').select(PAYMENT_COLUMNS).eq('user_id', userId).eq('status', 'paid'),
    supabase.from('student_profiles').select('id').eq('user_id', userId).maybeSingle(),
  ]);
  for (const res of [userRes, leadsRes, paymentsRes, spRes]) if (res.error) throw res.error;

  const leads = leadsRes.data || [];
  const lead = pickFeeLead(leads);
  let installments: InstallmentRow[] = [];
  if (lead) {
    const { data, error } = await supabase
      .from('payment_installments')
      .select(INSTALLMENT_COLUMNS)
      .eq('lead_profile_id', lead.id)
      .order('installment_number', { ascending: true });
    if (error) throw error;
    installments = data || [];
  }
  const payments = paymentsRes.data || [];
  return {
    user: userRes.data ?? null,
    leads,
    lead,
    payments,
    installments,
    studentProfileId: spRes.data?.id ?? null,
    view: buildFeeView({ lead, payments, installments }),
  };
}

/**
 * Mark installments paid (or back to pending) from the payments that exist.
 * Razorpay installment payments land here too, through the daily cron.
 */
export async function reconcileInstallments(supabase: any, state: StudentFeeState): Promise<number> {
  const { lead, installments, payments } = state;
  if (!lead || !installments.length) return 0;
  const agreed = effectiveAgreedFee(lead);
  const scheduled = installments.filter((i) => i.status !== 'waived').reduce((s, i) => s + (money(i.amount) ?? 0), 0);
  const alloc = allocatePayments(installments, payments, {
    unscheduledFirst: agreed === null ? 0 : Math.max(0, agreed - scheduled),
  });
  let changed = 0;
  for (const inst of installments) {
    if (inst.status === 'waived') continue;
    const a = alloc.get(inst.id)!;
    const status = a.settled ? 'paid' : 'pending';
    const paidAmount = Math.round(a.paidAmount * 100) / 100;
    if (inst.status === status && (money(inst.paid_amount) ?? 0) === paidAmount) continue;
    const { error } = await supabase
      .from('payment_installments')
      .update({
        status,
        paid_amount: paidAmount || null,
        paid_at: a.settled && a.paidOn ? `${a.paidOn}T00:00:00+05:30` : null,
        payment_id: a.paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inst.id);
    if (error) throw error;
    changed += 1;
  }
  return changed;
}

/**
 * Bring student_profiles (the cache older screens and revenue_by_year read) in
 * line with the canonical rows, including the next due date.
 */
export async function refreshStudentFeeCache(supabase: any, state: StudentFeeState): Promise<boolean> {
  const { view, studentProfileId } = state;
  if (!studentProfileId || view.agreed === null) return false;
  const { error } = await supabase
    .from('student_profiles')
    .update({
      total_fee: view.agreed,
      fee_paid: view.paidTotal,
      fee_due: view.balance ?? 0,
      // The payment_status enum has no 'partial'. Part paid is fee_paid > 0.
      payment_status: (view.balance ?? 0) <= 0.01 ? 'paid' : 'pending',
      next_payment_date: view.nextDue?.dueDate ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', studentProfileId);
  if (error) throw error;
  return true;
}

function officeReceiptNumber(): string {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${OFFICE_RECEIPT_PREFIX}${Date.now().toString(36).toUpperCase()}${random}`;
}

export interface RecordedPaymentLine {
  key: string;
  id: string | null;
  amount: number;
  created: boolean;
}

async function insertOfficePayments(
  supabase: any,
  input: {
    userId: string;
    leadProfileId: string | null;
    studentProfileId: string | null;
    lines: readonly PaymentLineInput[];
    existing: readonly { id: string; idempotency_key?: string | null }[];
    adminId: string | null;
  },
): Promise<RecordedPaymentLine[]> {
  const out: RecordedPaymentLine[] = [];
  for (const line of input.lines) {
    const amount = money(line.amount) ?? 0;
    const prior = input.existing.find((p) => p.idempotency_key && p.idempotency_key === line.key);
    if (prior) {
      out.push({ key: line.key, id: prior.id, amount, created: false });
      continue;
    }
    // `description`, NOT `notes`: payments has no notes column.
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: input.userId,
        student_profile_id: input.studentProfileId,
        lead_profile_id: input.leadProfileId,
        amount,
        currency: 'INR',
        status: 'paid',
        payment_method: line.method,
        installment_number: line.installmentNumber ?? null,
        receipt_number: officeReceiptNumber(),
        paid_at: `${line.paidOn}T00:00:00+05:30`,
        idempotency_key: line.key,
        description: 'Recorded by the office.' + (line.reference ? ` Reference: ${line.reference}` : ''),
        metadata: { source: 'office', entered_by: input.adminId },
      })
      .select('id')
      .single();
    if (error) {
      // The same line arriving twice (a double click): the first one won.
      if (error.code === '23505' && String(error.message || '').includes('idempotency')) {
        const { data: again } = await supabase.from('payments').select('id').eq('idempotency_key', line.key).maybeSingle();
        out.push({ key: line.key, id: again?.id ?? null, amount, created: false });
        continue;
      }
      throw error;
    }
    out.push({ key: line.key, id: data.id, amount, created: true });
  }
  return out;
}

export interface SaveApplicationAndFeesOptions {
  userId: string;
  /** Application fields (STAFF_APPLICATION_FIELDS). Absent keys are left alone. */
  details?: Record<string, unknown> | null;
  plan: FeePlanInput;
  payments?: PaymentLineInput[];
  adminId: string;
  /** Accepting a student's fee report: closed only when this save succeeds. */
  resolvesCorrectionId?: string | null;
  dryRun?: boolean;
}

export interface SaveApplicationAndFeesResult {
  userId: string;
  name: string | null;
  applied: boolean;
  leadProfileId: string | null;
  createdLead: boolean;
  /** A profile-page row became a staff-entered application. */
  stampedReviewer: boolean;
  changes: Record<string, { before: unknown; after: unknown }>;
  payments: RecordedPaymentLine[];
  view: FeeView;
  signature: string;
  checkChanged: boolean;
  warnings: string[];
}

function comparable(value: unknown): unknown {
  if (value === undefined || value === '') return null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * Save a student's application and fee plan, and record money received.
 *
 * Order matters, as in setStudentFees: lead_profiles (the agreed total) first,
 * then payments, then the schedule, then the reconcile and the cache. Every write
 * checks its error: an unchecked insert once silently wrote 0 of 59 payments.
 */
export async function saveStudentApplicationAndFees(
  options: SaveApplicationAndFeesOptions,
  supabase: any,
): Promise<SaveApplicationAndFeesResult> {
  const { userId, plan, adminId, dryRun } = options;
  const lines = options.payments || [];

  const state = await loadStudentFeeState(supabase, userId);
  if (!state.user) throw new StudentFeeError('No such user.');

  const check = validatePlan(plan, lines, {
    alreadyPaid: state.view.paidTotal,
    existing: state.view.payments.map((p) => ({ amount: p.amount, paidOn: p.paidOn })),
  });
  if (check.errors.length) {
    throw new StudentFeeError(check.errors.map((e) => e.message).join(' '), check.errors);
  }

  const lead = state.lead;
  const assigned = money(plan.assignedFee)!;
  const discount = money(plan.discount) ?? 0;
  const finalFee = check.finalFee!;
  const isInstallment = plan.scheme === 'installment';

  // What the lead row should say.
  const target: Record<string, unknown> = {};
  for (const field of STAFF_APPLICATION_FIELDS) {
    if (!options.details || !(field in options.details)) continue;
    const raw = options.details[field];
    target[field] = raw === '' ? null : raw;
  }
  Object.assign(target, {
    assigned_fee: assigned,
    discount_amount: discount,
    final_fee: finalFee,
    // The office form folds every discount into discount_amount.
    full_payment_discount: 0,
    payment_scheme: plan.scheme,
    installment_1_amount: isInstallment ? money(plan.installment1Amount) : null,
    installment_2_amount: isInstallment ? money(plan.installment2Amount) : null,
    fee_source: 'admin',
  });
  if (isInstallment) target.allowed_payment_modes = 'full_and_installment';

  const changes: SaveApplicationAndFeesResult['changes'] = {};
  const updates: Record<string, unknown> = {};
  for (const [field, after] of Object.entries(target)) {
    const before = lead ? lead[field] ?? null : null;
    if (comparable(before) === comparable(after)) continue;
    updates[field] = after;
    changes[field] = { before, after };
  }
  const stampReviewer = !lead || isStaffUnreviewedManualRow(lead);

  const result: SaveApplicationAndFeesResult = {
    userId,
    name: state.user.name ?? null,
    applied: false,
    leadProfileId: lead?.id ?? null,
    createdLead: !lead,
    stampedReviewer: Boolean(lead) && stampReviewer,
    changes,
    payments: [],
    view: state.view,
    signature: feeSignature(state.view),
    checkChanged: false,
    warnings: [...check.warnings],
  };
  if (state.user.is_alumni) result.warnings.push('This student has already graduated.');
  if (lead && state.leads.some((l) => l.id !== lead.id && money(l.final_fee) !== null)) {
    result.warnings.push('Another record for this student also has a fee. Only this one is used.');
  }
  if (dryRun) return result;

  const now = new Date().toISOString();

  // 1. lead_profiles, the agreed total.
  let leadId = lead?.id ?? null;
  if (lead) {
    const patch: Record<string, unknown> = { ...updates };
    if (stampReviewer) {
      patch.reviewed_by = adminId;
      patch.reviewed_at = now;
    }
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('lead_profiles').update({ ...patch, updated_at: now }).eq('id', lead.id);
      if (error) throw error;
    }
  } else {
    const { data, error } = await supabase
      .from('lead_profiles')
      .insert({
        user_id: userId,
        ...updates,
        source: 'manual',
        status: state.user.user_type === 'student' ? 'enrolled' : 'submitted',
        // Staff-entered: Nexus counts it as an application, not a profile-page row.
        reviewed_by: adminId,
        reviewed_at: now,
      })
      .select('id')
      .single();
    if (error) throw error;
    leadId = data.id;
    result.leadProfileId = leadId;
  }

  // 2. payments.
  result.payments = await insertOfficePayments(supabase, {
    userId,
    leadProfileId: leadId,
    studentProfileId: state.studentProfileId,
    lines,
    existing: state.payments,
    adminId,
  });

  // 3. the schedule.
  let existingInst: InstallmentRow[] = [];
  if (leadId) {
    const { data, error } = await supabase.from('payment_installments').select(INSTALLMENT_COLUMNS).eq('lead_profile_id', leadId);
    if (error) throw error;
    existingInst = data || [];
  }
  if (isInstallment && leadId) {
    const paidDates = [...state.view.payments.map((p) => p.paidOn), ...lines.map((l) => l.paidOn)]
      .filter((d): d is string => isDateKey(d))
      .sort();
    const rows = [
      { number: 1, amount: money(plan.installment1Amount)!, due: paidDates[0] ?? istToday() },
      { number: 2, amount: money(plan.installment2Amount)!, due: plan.installment2DueDate! },
    ];
    for (const r of rows) {
      const prior = existingInst.find((i) => i.installment_number === r.number);
      const dateMoved = !prior || prior.due_date !== r.due;
      const { error } = await supabase.from('payment_installments').upsert(
        {
          lead_profile_id: leadId,
          installment_number: r.number,
          amount: r.amount,
          due_date: r.due,
          reminder_date: addDaysToKey(r.due, -3),
          ...(dateMoved ? { reminder_sent: false, reminder_sent_at: null } : {}),
          ...(!prior || prior.status === 'waived' ? { status: 'pending' } : {}),
          updated_at: now,
        },
        { onConflict: 'lead_profile_id,installment_number' },
      );
      if (error) throw error;
    }
  } else if (leadId) {
    // Paid in full: an unpaid later installment no longer applies. Never deleted,
    // so what was once expected stays readable.
    const open = existingInst.filter((i) => i.installment_number >= 2 && i.status !== 'paid' && i.status !== 'waived');
    for (const i of open) {
      const { error } = await supabase
        .from('payment_installments')
        .update({ status: 'waived', admin_notes: 'Plan changed to full payment.', updated_at: now })
        .eq('id', i.id);
      if (error) throw error;
    }
  }

  // 4. reconcile, cache, check.
  await reconcileInstallments(supabase, await loadStudentFeeState(supabase, userId));
  const final = await loadStudentFeeState(supabase, userId);
  const cached = await refreshStudentFeeCache(supabase, final);
  if (!cached && !final.studentProfileId) {
    result.warnings.push('No student_profiles row, so the fee cache was not refreshed. The figures shown are correct.');
  }
  result.view = final.view;
  result.leadProfileId = final.lead?.id ?? leadId;
  result.signature = feeSignature(final.view);
  result.checkChanged = await markConfirmedCheckChanged(supabase, userId, result.signature);

  if (options.resolvesCorrectionId) {
    await resolveFeeCorrectionReport(supabase, {
      reportId: options.resolvesCorrectionId,
      status: 'accepted',
      resolvedBy: adminId,
      note: 'Fees updated by the office.',
      paymentIds: result.payments.filter((p) => p.created && p.id).map((p) => p.id as string),
    });
  }

  // 5. audit.
  const created = result.payments.filter((p) => p.created);
  if (Object.keys(changes).length || created.length) {
    await recordUserHistory(
      supabase,
      userId,
      'lead_profile.fees',
      Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.before])),
      {
        ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.after])),
        ...(isInstallment ? { installment_2_due_date: plan.installment2DueDate } : {}),
        ...(created.length ? { collected: created.map((p) => p.amount) } : {}),
      },
      adminId,
    );
  }

  result.applied = true;
  return result;
}

/**
 * Record one payment from Collections ("Record payment"), against the plan that
 * is already set. Same rules as the form: idempotent, reconciled, cached.
 */
export async function recordOfficePayment(
  options: { userId: string; line: PaymentLineInput; adminId: string },
  supabase: any,
): Promise<{ payment: RecordedPaymentLine; view: FeeView; warnings: string[] }> {
  const state = await loadStudentFeeState(supabase, options.userId);
  if (!state.user) throw new StudentFeeError('No such user.');
  if (!state.lead || state.view.agreed === null) {
    throw new StudentFeeError('Set the fee for this student first, then record payments against it.');
  }
  const check = validatePlan({ assignedFee: state.view.agreed, scheme: 'full' }, [options.line], {
    alreadyPaid: state.view.paidTotal,
    existing: state.view.payments.map((p) => ({ amount: p.amount, paidOn: p.paidOn })),
  });
  const lineErrors = check.errors.filter((e) => e.field.startsWith('payments.'));
  if (lineErrors.length) throw new StudentFeeError(lineErrors.map((e) => e.message).join(' '), lineErrors);

  const [payment] = await insertOfficePayments(supabase, {
    userId: options.userId,
    leadProfileId: state.lead.id,
    studentProfileId: state.studentProfileId,
    lines: [options.line],
    existing: state.payments,
    adminId: options.adminId,
  });
  await reconcileInstallments(supabase, await loadStudentFeeState(supabase, options.userId));
  const final = await loadStudentFeeState(supabase, options.userId);
  await refreshStudentFeeCache(supabase, final);
  await markConfirmedCheckChanged(supabase, options.userId, feeSignature(final.view));
  if (payment.created) {
    await recordUserHistory(
      supabase,
      options.userId,
      'payment.recorded',
      null,
      { amount: payment.amount, paid_on: options.line.paidOn, method: options.line.method },
      options.adminId,
    );
  }
  return { payment, view: final.view, warnings: check.warnings };
}

/**
 * For the daily crons: every student with an open installment is reconciled, so
 * a Razorpay or direct-link payment also closes the installment it paid.
 */
export async function reconcileAllOpenInstallments(supabase: any): Promise<{ students: number; changed: number }> {
  const { data: open, error } = await supabase.from('payment_installments').select('lead_profile_id').eq('status', 'pending');
  if (error) throw error;
  const leadIds = Array.from(new Set((open || []).map((r: any) => r.lead_profile_id))) as string[];
  if (!leadIds.length) return { students: 0, changed: 0 };
  const { data: leads, error: leadError } = await supabase.from('lead_profiles').select('user_id').in('id', leadIds);
  if (leadError) throw leadError;
  const userIds = Array.from(new Set((leads || []).map((l: any) => l.user_id).filter(Boolean))) as string[];
  let changed = 0;
  for (const userId of userIds) {
    const n = await reconcileInstallments(supabase, await loadStudentFeeState(supabase, userId));
    if (n) {
      changed += n;
      await refreshStudentFeeCache(supabase, await loadStudentFeeState(supabase, userId));
    }
  }
  return { students: userIds.length, changed };
}
