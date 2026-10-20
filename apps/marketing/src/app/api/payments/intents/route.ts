// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getDirectEnrollmentLinkByToken, logDirectEnrollmentLinkEvent } from '@neram/database';
import { getOrCreateEnrolmentIntent, getOrCreateInstallmentIntent } from '@neram/database/payments';
import { verifyFirebaseToken } from '../../_lib/auth';
import { resolveEnrolUser, formFromBody } from '../../enroll/_lib/enrol-user';

/**
 * POST /api/payments/intents (Firebase auth)
 * Body: { token, scheme: 'full' | 'installment', ...the application form }
 *
 * Before an Instant UPI order can start, the student's details must be on the
 * link (auto-fulfilment enrols from them) and the plan must be fixed. This
 * saves both and returns the open intent for the link, priced by the server.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  // Balance payments: the intent is the fee plan's next due for the signed-in student.
  if (body.purpose === 'installment') {
    try {
      const supabase = createAdminClient();
      const intent = await getOrCreateInstallmentIntent(supabase, { userId: auth.userId });
      if (!intent.ok) return NextResponse.json({ error: 'There is nothing to pay on your account right now.', code: intent.code }, { status: 409 });
      if (!intent.intent.metadata?.created_by_auth) {
        await supabase.from('payment_intents').update({ metadata: { ...(intent.intent.metadata || {}), created_by_auth: auth.userId } }).eq('id', intent.intent.id);
      }
      return NextResponse.json({ success: true, data: { intentId: intent.intent.id, amountPaise: intent.amountPaise, scheme: 'installment', userId: auth.userId } });
    } catch (error: any) {
      console.error('[payments/intents] balance failed:', error?.message);
      return NextResponse.json({ error: 'Could not prepare the payment. Try again.' }, { status: 500 });
    }
  }

  const scheme = body.scheme === 'installment' ? 'installment' : body.scheme === 'full' ? 'full' : null;
  if (!body.token || !scheme) return NextResponse.json({ error: 'token and scheme are required' }, { status: 400 });
  if (!body.firstName || !body.applicantCategory) return NextResponse.json({ error: 'Your details are incomplete. Go back and check them.' }, { status: 400 });
  if (!body.phoneVerified) return NextResponse.json({ error: 'Phone verification is required' }, { status: 400 });
  // Instant UPI enrols without a submit button, so the terms are checked here, not only on the form.
  if (body.termsAccepted !== true) return NextResponse.json({ error: 'Please accept the terms and the refund policy first.', code: 'TERMS_REQUIRED' }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const link = await getDirectEnrollmentLinkByToken(body.token, supabase);
    if (!link || link.payment_mode !== 'student_pays' || link.status !== 'active' || new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired enrollment link', code: 'NOT_ACTIVE' }, { status: 400 });
    }
    const who = await resolveEnrolUser(supabase, link, auth);
    if ('response' in who) return who.response;
    const form = formFromBody(body);

    // The details ride on the link: auto-fulfilment and "pay later" both read them from here.
    const { data: saved, error: saveErr } = await supabase
      .from('direct_enrollment_links')
      .update({
        submitted_form: form,
        submitted_user_id: who.userId,
        chosen_scheme: scheme,
        details_saved_at: link.details_saved_at || new Date().toISOString(),
        parent_phone: form.parentPhone || link.parent_phone || null,
      })
      .eq('id', link.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (saveErr) throw saveErr;
    if (!saved) return NextResponse.json({ error: 'This link was already used. Refresh the page.', code: 'NOT_ACTIVE' }, { status: 409 });
    if (!link.details_saved_at) await logDirectEnrollmentLinkEvent(link.id, 'details_saved', null, { scheme, via: 'instant_upi' }, supabase).catch(() => undefined);

    const intent = await getOrCreateEnrolmentIntent(supabase, { link, scheme, userId: who.userId });
    if (!intent.ok) {
      const status = intent.code === 'SCHEME_LOCKED' ? 409 : 400;
      const message =
        intent.code === 'SCHEME_LOCKED'
          ? 'A payment is already in progress on the other plan. Finish or cancel it first.'
          : intent.code === 'PLAN_NOT_OFFERED'
            ? 'That plan is not offered on this link.'
            : 'This link is not open for payment.';
      return NextResponse.json({ error: message, code: intent.code }, { status });
    }
    // Remember which sign-in made it, so the attempt routes can check ownership
    // even when the enrolled account is the merged demo account.
    if (!intent.intent.metadata?.created_by_auth) {
      await supabase
        .from('payment_intents')
        .update({ metadata: { ...(intent.intent.metadata || {}), created_by_auth: auth.userId } })
        .eq('id', intent.intent.id);
    }
    return NextResponse.json({ success: true, data: { intentId: intent.intent.id, amountPaise: intent.amountPaise, scheme, userId: who.userId } });
  } catch (error: any) {
    console.error('[payments/intents] failed:', error?.message);
    return NextResponse.json({ error: 'Could not prepare the payment. Try again.' }, { status: 500 });
  }
}
