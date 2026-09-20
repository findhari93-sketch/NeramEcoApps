// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { setStudentFees, validateFees, STUDENT_FEE_FIELDS } from '@neram/database/queries';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Setting a student's fee from Admin.
 *
 * This exists because the complete fee form lived inside the "approve
 * application" action and could therefore never be reached for a student who has
 * no application. 38 active students on prod were in exactly that position, and
 * the only post-approval editor, EditUserDialog's Fee & Notes tab, writes
 * assigned_fee and discount_amount but NOT final_fee, so using it would leave
 * the canonical total empty while looking like it had worked.
 *
 * All writing happens in setStudentFees (packages/database), which the one-off
 * spreadsheet backfill also calls. One code path for money, not two.
 */

/** GET /api/students/fees?userId=... — what is on record now. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || '';
    if (!UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: 'A valid userId is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email, is_alumni')
      .eq('id', userId)
      .maybeSingle();
    if (userError) throw userError;
    if (!user) return NextResponse.json({ error: 'No such student.' }, { status: 404 });

    const { data: lead, error: leadError } = await supabase
      .from('lead_profiles')
      .select(`id, source, status, ${STUDENT_FEE_FIELDS.join(', ')}`)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (leadError) throw leadError;

    // Collected money comes from paid payments, never from the student_profiles
    // cache, which is documented as drifting.
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, amount, status, paid_at, receipt_number, payment_method, description')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (paymentsError) throw paymentsError;

    const paid = (payments || [])
      .filter((p: any) => p.status === 'paid')
      .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

    const fees: Record<string, unknown> = {};
    for (const field of STUDENT_FEE_FIELDS) fees[field] = lead?.[field] ?? null;

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, isAlumni: !!user.is_alumni },
      hasApplication: !!lead,
      leadProfileId: lead?.id ?? null,
      fees,
      collected: paid,
      payments: payments || [],
    });
  } catch (err: any) {
    console.error('[students/fees] GET failed:', err?.message);
    return NextResponse.json({ error: err?.message || 'Could not read the fees.' }, { status: 500 });
  }
}

/**
 * POST /api/students/fees
 * Body: { userId, fees, collected?, adminId?, dryRun? }
 *
 * `dryRun: true` returns the same before/after the spreadsheet loader prints,
 * so the dialog can show staff exactly what will move before they commit.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, fees, collected, adminId, dryRun } = body ?? {};

    if (!UUID_REGEX.test(String(userId || ''))) {
      return NextResponse.json({ error: 'A valid userId is required.' }, { status: 400 });
    }
    if (!fees || typeof fees !== 'object') {
      return NextResponse.json({ error: 'No fee values were sent.' }, { status: 400 });
    }

    // Drop anything not on the allowlist rather than passing an arbitrary object
    // to an update. A stray key here would be an unvalidated column write.
    const safeFees: Record<string, unknown> = {};
    for (const field of STUDENT_FEE_FIELDS) {
      if (field in fees) safeFees[field] = fees[field];
    }
    if (!Object.keys(safeFees).length && !collected) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const safeCollected =
      collected && Number(collected.amount) > 0
        ? {
            amount: Number(collected.amount),
            paidAt: collected.paidAt || null,
            method: collected.method || 'manual',
            reference: collected.reference || null,
          }
        : null;

    const check = validateFees(safeFees, safeCollected);
    if (check.errors.length) {
      return NextResponse.json({ error: check.errors.join(' ') }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const result = await setStudentFees(
      {
        userId,
        fees: safeFees,
        collected: safeCollected,
        adminId: adminId && UUID_REGEX.test(String(adminId)) ? adminId : null,
        dryRun: dryRun === true,
      },
      supabase,
    );

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    // A StudentFeeError is the caller's mistake (arithmetic that cannot be true),
    // so it must read as a 400 they can fix, not a 500 that looks like our fault.
    const isUserError = err?.name === 'StudentFeeError';
    console.error('[students/fees] POST failed:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Could not save the fees.' },
      { status: isUserError ? 400 : 500 },
    );
  }
}
