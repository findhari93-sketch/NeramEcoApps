import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient } from '@neram/database';
import {
  LEAD_PROFILE_FINANCE_COLUMNS,
  LEAD_PROFILE_KEY_COLUMNS,
  STUDENT_PROFILE_FINANCE_COLUMNS,
  STUDENT_PROFILE_KEY_COLUMNS,
  computeFeeSummary,
  selectColumns,
} from '@/lib/student-finance';
import type { StudentFinancePayload } from '@/lib/student-profile-types';

/**
 * GET /api/students/[id]/finance?classroom={id}
 *
 * Everything commercial about a student: the agreed fee, what has been paid,
 * what is outstanding, when the next payment falls due, the instalment scheme,
 * cashback, scholarship eligibility and marketing attribution.
 *
 * ---------------------------------------------------------------------------
 * THIS ROUTE IS THE FEE GATE.
 *
 * It is the ONLY place in Nexus that names LEAD_PROFILE_FINANCE_COLUMNS or
 * STUDENT_PROFILE_FINANCE_COLUMNS, and it asserts coord.student.finance before
 * its first query. A teacher therefore never reaches a handler that selects a
 * fee column, so the values are not merely hidden in the UI, they are absent
 * from every payload a teacher can obtain.
 *
 * Do not "simplify" this by folding the fields back into ../route.ts behind a
 * conditional. A conditional select is one refactor away from leaking, and the
 * disjointness test in student-finance.test.ts cannot protect a shape that no
 * longer has two lists.
 * ---------------------------------------------------------------------------
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    // Two asserts, deliberately. The first answers "may you look at students at
    // all", the second "may you look at their money". A teacher fails the second.
    assertCapability(caller, 'coord.student.view');
    assertCapability(caller, 'coord.student.finance');

    const { id: studentId } = await params;
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Wave 1: the two rows that hold the fee agreement and the cache, plus the
    // enrolment date the derived due-date fallback needs.
    const [leadResult, recordResult, enrollmentResult] = await Promise.all([
      supabase
        .from('lead_profiles')
        .select(selectColumns(LEAD_PROFILE_KEY_COLUMNS, LEAD_PROFILE_FINANCE_COLUMNS))
        .eq('user_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('student_profiles')
        .select(selectColumns(STUDENT_PROFILE_KEY_COLUMNS, STUDENT_PROFILE_FINANCE_COLUMNS))
        .eq('user_id', studentId)
        .maybeSingle(),

      supabase
        .from('nexus_enrollments')
        .select('enrolled_at')
        .eq('classroom_id', classroomId)
        .eq('user_id', studentId)
        .eq('role', 'student')
        .maybeSingle(),
    ]);

    const lead = (leadResult.data as any) ?? null;
    const record = (recordResult.data as any) ?? null;

    if (!enrollmentResult.data) {
      return NextResponse.json(
        { error: 'Student not enrolled in this classroom' },
        { status: 404 },
      );
    }

    // Wave 2: money that has moved. Both queries carry the student predicate in
    // SQL. getUserJourneyDetail in packages/database/src/queries/crm.ts fetches
    // EVERY payment_installments row and filters in JavaScript; that shape is
    // deliberately not copied here.
    const [paymentsResult, installmentsResult] = await Promise.all([
      supabase
        .from('payments')
        .select(
          'id, amount, status, paid_at, payment_method, receipt_number, receipt_url, ' +
            'installment_number, payer_name, payer_relationship',
        )
        .eq('user_id', studentId)
        .order('paid_at', { ascending: false, nullsFirst: false }),

      lead?.id
        ? supabase
            .from('payment_installments')
            .select('installment_number, amount, due_date, status, paid_at')
            .eq('lead_profile_id', lead.id)
            .order('installment_number', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const payments = (paymentsResult.data as any[]) || [];

    const summary = computeFeeSummary({
      finalFee: lead?.final_fee ?? null,
      payments,
      nextPaymentDate: record?.next_payment_date ?? null,
      paymentDeadline: lead?.payment_deadline ?? null,
      enrollmentDate:
        (enrollmentResult.data as any)?.enrolled_at ?? null,
      installment2DueDays: lead?.installment_2_due_days ?? null,
      // Read ONLY to detect drift. These numbers are never rendered: see the
      // "which total is true" note in lib/student-finance.ts.
      cache: record
        ? {
            fee_paid: record.fee_paid ?? null,
            fee_due: record.fee_due ?? null,
            total_fee: record.total_fee ?? null,
          }
        : null,
    });

    const payload: StudentFinancePayload = {
      agreed: summary.agreed,
      paid: summary.paid,
      balance: summary.balance,
      nextDue: summary.nextDue,
      scheme: {
        payment_scheme: lead?.payment_scheme ?? null,
        assigned_fee: lead?.assigned_fee ?? null,
        discount_amount: lead?.discount_amount ?? null,
        full_payment_discount: lead?.full_payment_discount ?? null,
        coupon_code: lead?.coupon_code ?? null,
        installment_1_amount: lead?.installment_1_amount ?? null,
        installment_2_amount: lead?.installment_2_amount ?? null,
        allowed_payment_modes: lead?.allowed_payment_modes ?? null,
        payment_status: record?.payment_status ?? null,
      },
      cashback: {
        eligible: lead?.total_cashback_eligible ?? null,
        processed: lead?.total_cashback_processed ?? null,
      },
      scholarship: {
        caste_category: lead?.caste_category ?? null,
        eligible: lead?.scholarship_eligible ?? null,
      },
      attribution: {
        source: lead?.source ?? null,
        utm_source: lead?.utm_source ?? null,
        utm_medium: lead?.utm_medium ?? null,
        utm_campaign: lead?.utm_campaign ?? null,
        referral_code: lead?.referral_code ?? null,
      },
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount ?? null,
        status: p.status ?? null,
        paid_at: p.paid_at ?? null,
        payment_method: p.payment_method ?? null,
        receipt_number: p.receipt_number ?? null,
        receipt_url: p.receipt_url ?? null,
        installment_number: p.installment_number ?? null,
        payer_name: p.payer_name ?? null,
        payer_relationship: p.payer_relationship ?? null,
      })),
      installments: ((installmentsResult.data as any[]) || []).map((i) => ({
        installment_number: i.installment_number ?? null,
        amount: i.amount ?? null,
        due_date: i.due_date ?? null,
        status: i.status ?? null,
        paid_at: i.paid_at ?? null,
      })),
      cacheDisagreement: summary.cacheDisagreement,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error('Student finance error:', err);
    return errorResponse(err, 'Failed to load student finance');
  }
}
