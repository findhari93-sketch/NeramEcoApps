/**
 * Finalise a demo student's enrolment from the desk, for a 'recorded'-mode link
 * whose amount a staff member typed in but never finalised (money shows on the
 * link, but there is no payment row and no student profile yet). Two shapes:
 *
 *  - 'create': the link's user is still a lead; delegate to finaliseDirectEnrolment
 *    (the proven path that makes the student, the profile, the fees and marks the
 *    link used). The caller provisions the Microsoft account when asked.
 *  - 'fold_parent': the real student already exists as a SEPARATE account (e.g. a
 *    child provisioned straight into Nexus, attending), not linked to the demo's
 *    parent/lead account. Fold the parent/lead account INTO that student account
 *    (merge, relation 'parent': the student stays the identity, the parent's phone
 *    and email become family contacts), then give the student a fee profile, record
 *    the money, and mark the link used. Never provisions a new account or Team.
 *
 * Both shapes recompute the fee scheme from the amounts, so a link saved as 'full'
 * but only part paid is corrected to an installment plan with a real balance.
 *
 * No @neram/auth / Microsoft Graph here: provisioning stays in the admin route.
 */
import { createStudentProfile, getStudentProfileByUserId, updateStudentProfile } from '../queries/users';
import { updateDirectEnrollmentLink } from '../queries/direct-enrollment';
import { closeDemoFollowUpsOnEnrol } from '../queries/demo-follow-ups';
import { saveStudentApplicationAndFees } from '../queries/office-fees';
import { mergeUserRecordsLogged, type MergeUserRow } from '../queries/user-merge';
import { finaliseDirectEnrolment } from './direct-enrolment';
import { defaultBalanceDueDate } from '../utils/enrolment-link';
import { istToday, isOfficePaymentMethod } from '../utils/fee-plan';

const MERGE_COLS = 'id, name, email, personal_email, ms_oid, firebase_uid, google_id, phone, date_of_birth, academic_year, is_alumni';
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface DeskFinaliseMoney {
  /** The total fee the student owes (the final fee after any discount). */
  totalFee: number;
  /** How much is paid now (installment 1 when it is less than the total). */
  amountPaid: number;
  /** The date the balance is due; defaulted when a balance remains and none is given. */
  installment2DueDate?: string | null;
  method?: string | null;
  reference?: string | null;
}

export interface DeskFinaliseInput {
  /** The full direct_enrollment_links row (not the desk subset). */
  link: any;
  demoId: string | null;
  actorId: string | null;
  money: DeskFinaliseMoney;
  target: { mode: 'create' } | { mode: 'fold_parent'; studentUserId: string };
}

export type DeskFinaliseResult =
  | {
      ok: true;
      mode: 'create' | 'fold_parent';
      studentUserId: string;
      studentProfileId: string;
      applicationNumber: string | null;
      mergeLogId?: string | null;
    }
  | { ok: false; status: number; error: string; details?: string };

/** Recompute the plan from the amounts, fixing a 'full' scheme that is only part paid. */
function normalisedPlan(money: DeskFinaliseMoney, paidOn: string) {
  const totalFee = round2(money.totalFee);
  const amountPaid = round2(money.amountPaid);
  const balance = round2(Math.max(0, totalFee - amountPaid));
  const scheme: 'full' | 'installment' = balance > 0.01 ? 'installment' : 'full';
  const installment2DueDate = scheme === 'installment' ? money.installment2DueDate || defaultBalanceDueDate(paidOn) : null;
  return { totalFee, amountPaid, balance, scheme, installment2DueDate };
}

async function fetchMergeRow(supabase: any, id: string): Promise<MergeUserRow | null> {
  const { data } = await supabase.from('users').select(MERGE_COLS).eq('id', id).maybeSingle();
  return (data as MergeUserRow) || null;
}

export async function finaliseEnrolmentFromDesk(supabase: any, input: DeskFinaliseInput): Promise<DeskFinaliseResult> {
  const { link, actorId, money } = input;
  const paidOn = istToday();
  const plan = normalisedPlan(money, paidOn);
  if (plan.amountPaid <= 0 || plan.totalFee <= 0) {
    return { ok: false, status: 400, error: 'Enter the total fee and the amount paid.' };
  }

  // Normalise the link's money columns first, so every downstream reader agrees.
  const linkMoney: Record<string, unknown> = {
    total_fee: plan.totalFee,
    final_fee: plan.totalFee,
    amount_paid: plan.amountPaid,
    payment_scheme: plan.scheme,
    installment_2_amount: plan.scheme === 'installment' ? plan.balance : null,
    installment_2_due_date: plan.installment2DueDate,
  };
  if (money.method) linkMoney.payment_method = money.method;
  if (money.reference) linkMoney.transaction_reference = money.reference;

  // ── create ──────────────────────────────────────────────────────────────
  if (input.target.mode === 'create') {
    await updateDirectEnrollmentLink(link.id, linkMoney as any, supabase);
    const firstName = String(link.student_name || 'Student').trim().split(/\s+/)[0] || 'Student';
    const res = await finaliseDirectEnrolment(supabase, {
      link: { ...link, ...linkMoney },
      userId: link.user_id,
      form: {
        firstName,
        applicantCategory: 'general',
        studentPhone: link.student_phone || null,
        parentPhone: link.parent_phone || null,
      },
      payment: { method: money.method || 'manual', reference: money.reference || null, date: paidOn },
      verifiedBy: actorId,
    });
    if (!res.ok) return res;
    return {
      ok: true,
      mode: 'create',
      studentUserId: link.user_id,
      studentProfileId: res.studentProfileId,
      applicationNumber: res.applicationNumber,
    };
  }

  // ── fold_parent ─────────────────────────────────────────────────────────
  const studentUserId = input.target.studentUserId;
  const parentUserId = (link.user_id as string) || null;
  if (!studentUserId) return { ok: false, status: 400, error: 'Pick the existing student account.' };

  let mergeLogId: string | null = null;
  if (parentUserId && parentUserId !== studentUserId) {
    const [studentRow, parentRow] = await Promise.all([fetchMergeRow(supabase, studentUserId), fetchMergeRow(supabase, parentUserId)]);
    if (!studentRow) return { ok: false, status: 404, error: 'That student account was not found.' };
    if (parentRow) {
      // Two different Microsoft logins means two different people: never fold them.
      if (studentRow.ms_oid && parentRow.ms_oid && studentRow.ms_oid !== parentRow.ms_oid) {
        return {
          ok: false,
          status: 409,
          error: 'These two accounts each have a different Microsoft login, so they look like two different people. Link them by hand instead.',
        };
      }
      try {
        // The student is the survivor (its ms_oid + Nexus enrolment stay). relation
        // 'parent' keeps the student's details and saves the parent's as family contacts.
        const merged = await mergeUserRecordsLogged(studentUserId, parentUserId, actorId, { relation: 'parent', via: 'staff' }, supabase);
        mergeLogId = merged.logId;
      } catch (e: any) {
        return { ok: false, status: 500, error: 'Could not fold the parent account into the student.', details: e?.message };
      }
    }
  }

  // The demo and the link now point at the student. Give the student a fee profile.
  const profileFee = {
    payment_status: plan.balance > 0.01 ? 'pending' : 'paid',
    total_fee: plan.totalFee,
    fee_paid: plan.amountPaid,
    fee_due: plan.balance,
    next_payment_date: plan.scheme === 'installment' ? plan.installment2DueDate : null,
  } as const;
  const existingProfile = await getStudentProfileByUserId(studentUserId, supabase);
  let studentProfileId: string;
  let applicationNumber: string | null;
  if (existingProfile) {
    const updated = await updateStudentProfile(existingProfile.id, profileFee as any, supabase);
    studentProfileId = updated.id;
    applicationNumber = (updated as any).student_id ?? (existingProfile as any).student_id ?? null;
  } else {
    const created = await createStudentProfile(
      {
        user_id: studentUserId,
        enrollment_date: new Date().toISOString().split('T')[0],
        batch_id: link.batch_id || null,
        course_id: link.course_id || null,
        ms_teams_id: null,
        ms_teams_email: null,
        ...profileFee,
        lessons_completed: 0,
        assignments_completed: 0,
        total_watch_time: 0,
        last_activity_at: null,
        parent_contact: link.parent_phone || null,
        emergency_contact: null,
        notes: null,
      } as any,
      supabase,
    );
    studentProfileId = created.id;
    applicationNumber = (created as any).student_id ?? null;
  }

  // Record the money through the office fee writer. The idempotency key on the link
  // makes a retry a no-op, so the ₹ is never counted twice.
  try {
    await saveStudentApplicationAndFees(
      {
        userId: studentUserId,
        plan: {
          assignedFee: plan.totalFee,
          discount: 0,
          scheme: plan.scheme,
          installment1Amount: plan.scheme === 'installment' ? plan.amountPaid : null,
          installment2Amount: plan.scheme === 'installment' ? plan.balance : null,
          installment2DueDate: plan.scheme === 'installment' ? plan.installment2DueDate : null,
        },
        payments: [
          {
            key: `direct-link:${link.id}`,
            amount: plan.amountPaid,
            paidOn,
            method: money.method && isOfficePaymentMethod(money.method) ? money.method : 'manual',
            reference: money.reference || null,
            installmentNumber: 1,
          },
        ],
        adminId: actorId || link.created_by,
      } as any,
      supabase,
    );
  } catch (e: any) {
    // Never lose the money: fall back to a bare payment row keyed to the link.
    const { error: payErr } = await supabase
      .from('payments')
      .upsert(
        {
          user_id: studentUserId,
          student_profile_id: studentProfileId,
          amount: plan.amountPaid,
          currency: 'INR',
          status: 'paid',
          payment_method: money.method || 'manual',
          paid_at: new Date().toISOString(),
          installment_number: 1,
          idempotency_key: `direct-link:${link.id}`,
          description: 'Finalised from the demo desk.',
          verified_by: actorId,
          verified_at: new Date().toISOString(),
        },
        { onConflict: 'idempotency_key' },
      );
    if (payErr) console.error('[desk-finalise] fallback payment failed:', payErr.message);
  }

  await updateDirectEnrollmentLink(
    link.id,
    {
      status: 'used',
      used_by: studentUserId,
      used_at: new Date().toISOString(),
      student_profile_id: studentProfileId,
      verified_by: actorId,
      verified_at: new Date().toISOString(),
    } as any,
    supabase,
  );
  await closeDemoFollowUpsOnEnrol(studentUserId, supabase).catch((e: any) => console.error('[desk-finalise] close follow-ups failed:', e?.message));

  return { ok: true, mode: 'fold_parent', studentUserId, studentProfileId, applicationNumber, mergeLogId };
}
