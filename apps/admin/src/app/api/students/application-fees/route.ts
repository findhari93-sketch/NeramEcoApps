export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  loadStudentFeeState,
  saveStudentApplicationAndFees,
  getLatestRecordCheck,
  getOpenFeeCorrection,
  STAFF_APPLICATION_FIELDS,
} from '@neram/database';
import { UUID_REGEX, actingAdminId, parseLines, parsePlan } from '@/lib/fee-request';
import { sendRecordCheck } from '@/lib/record-check-send';

/**
 * The Application and fees form: a student's application details, fee plan and
 * money received, read and saved together. Money is written only by
 * saveStudentApplicationAndFees (packages/database), one code path.
 */

/** GET /api/students/application-fees?userId=... */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || '';
  if (!UUID_REGEX.test(userId)) return NextResponse.json({ error: 'A valid userId is required.' }, { status: 400 });
  try {
    const sb: any = createAdminClient();
    const [state, userRes, latestCheck, openReport] = await Promise.all([
      loadStudentFeeState(sb, userId),
      sb.from('users').select('id, name, email, phone, academic_year, is_alumni').eq('id', userId).maybeSingle(),
      getLatestRecordCheck(sb, userId),
      getOpenFeeCorrection(sb, userId),
    ]);
    if (userRes.error) throw userRes.error;
    if (!userRes.data) return NextResponse.json({ error: 'No such student.' }, { status: 404 });

    const lead = state.lead;
    const details: Record<string, unknown> = {
      id: lead?.id ?? null,
      source: lead?.source ?? null,
      application_number: lead?.application_number ?? null,
    };
    for (const field of STAFF_APPLICATION_FIELDS) details[field] = lead ? lead[field] ?? null : null;

    const second = state.installments.find((i) => i.installment_number === 2 && i.status !== 'waived');
    // The office form keeps every discount in one field. An older online row may
    // carry a full-payment discount too; fold it in so saving the form unchanged
    // keeps the same agreed total (effectiveAgreedFee subtracts it).
    const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
    const finalFee = num(lead?.final_fee);
    const discountAmount = num(lead?.discount_amount) ?? 0;
    const fullDiscount =
      lead?.payment_scheme === 'full' && lead?.allowed_payment_modes !== 'full_only' ? num(lead?.full_payment_discount) ?? 0 : 0;
    const assigned = num(lead?.assigned_fee) ?? (finalFee !== null ? finalFee + discountAmount : null);
    const fees = {
      assignedFee: assigned,
      discount: discountAmount + Math.max(0, fullDiscount),
      scheme: second || lead?.payment_scheme === 'installment' ? 'installment' : 'full',
      installment1Amount: lead?.installment_1_amount ?? null,
      installment2Amount: lead?.installment_2_amount ?? second?.amount ?? null,
      installment2DueDate: second?.due_date ?? null,
      hasFee: state.view.agreed !== null,
    };

    return NextResponse.json({
      student: userRes.data,
      hasApplication: Boolean(lead),
      details,
      fees,
      view: state.view,
      payments: state.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        paid_at: p.paid_at,
        created_at: p.created_at,
        payment_method: p.payment_method,
        description: p.description,
        receipt_number: p.receipt_number,
        installment_number: p.installment_number,
      })),
      latestCheck,
      openReport,
    });
  } catch (err: any) {
    console.error('[application-fees] GET failed:', err?.message);
    return NextResponse.json({ error: 'Could not read the form and fees.' }, { status: 500 });
  }
}

/**
 * POST /api/students/application-fees
 * Body: { userId, details, plan, payments, resolvesCorrectionId?, dryRun?, send? }
 * The acting admin comes from the verified request, never from the body.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.userId || '');
  if (!UUID_REGEX.test(userId)) return NextResponse.json({ error: 'A valid userId is required.' }, { status: 400 });
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to save.' }, { status: 401 });

  const resolvesCorrectionId =
    typeof body?.resolvesCorrectionId === 'string' && UUID_REGEX.test(body.resolvesCorrectionId)
      ? body.resolvesCorrectionId
      : null;
  const details = body?.details && typeof body.details === 'object' ? body.details : null;

  try {
    const sb: any = createAdminClient();
    const result = await saveStudentApplicationAndFees(
      {
        userId,
        details,
        plan: parsePlan(body?.plan),
        payments: parseLines(body?.payments),
        adminId,
        resolvesCorrectionId,
        dryRun: body?.dryRun === true,
      },
      sb,
    );

    let delivery: { delivered: boolean; channel: string | null; message: string; check?: unknown } | null = null;
    if (body?.send === true && result.applied) {
      try {
        delivery = await sendRecordCheck(sb, request, {
          userId,
          adminId,
          view: result.view,
          leadProfileId: result.leadProfileId,
        });
      } catch (e: any) {
        console.error('[application-fees] send failed:', e?.message);
        delivery = {
          delivered: false,
          channel: null,
          message: 'Saved, but the check could not be started. Press Send again.',
        };
      }
    }

    return NextResponse.json({ success: true, result, delivery });
  } catch (err: any) {
    if (err?.name === 'StudentFeeError') {
      return NextResponse.json({ error: err.message, fieldErrors: err.fieldErrors || [] }, { status: 400 });
    }
    console.error('[application-fees] POST failed:', err?.message);
    return NextResponse.json({ error: err?.message || 'Could not save the form and fees.' }, { status: 500 });
  }
}
