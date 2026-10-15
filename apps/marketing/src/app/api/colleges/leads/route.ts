export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { effectiveTier } from '@/lib/college-hub/plan';
import { deliverLeadToCollege } from '@/lib/college-dashboard/lead-delivery';

const MOBILE = /^[6-9]\d{9}$/;

/**
 * POST /api/colleges/leads
 * A student asks a college about admission and agrees to share their details
 * with it (consent_given must be true).
 *
 * - College on an active plan: delivered straight away to its dashboard, and
 *   its dashboard accounts get an email.
 * - Any other college: waits for Neram staff in Admin > College leads, as before.
 * The same phone asking the same college again within 30 days is not stored twice.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { college_id, name, phone, email, nata_score, city, message, consent_given, firebase_uid } = body;
  const parentPhone = typeof body.parent_phone === 'string' ? body.parent_phone.replace(/\D/g, '') : '';

  if (!college_id || !name || !phone || consent_given !== true) {
    return NextResponse.json({ error: 'Required: college_id, name, phone, consent_given=true' }, { status: 400 });
  }
  if (!MOBILE.test(String(phone))) {
    return NextResponse.json({ error: 'Valid 10-digit Indian mobile number required' }, { status: 400 });
  }
  if (parentPhone && !MOBILE.test(parentPhone)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit mobile number for your parent, or leave it empty' }, { status: 400 });
  }
  if (String(name).trim().length > 80 || (message && String(message).length > 1000)) {
    return NextResponse.json({ error: 'Please shorten your name or message' }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data: college } = await db
    .from('colleges')
    .select('id, name, slug, state_slug, neram_tier, tier_start_date, tier_end_date, status')
    .eq('id', college_id)
    .maybeSingle();
  if (!college || college.status !== 'active') return NextResponse.json({ error: 'Unknown college' }, { status: 400 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: dup } = await db
    .from('college_leads')
    .select('id')
    .eq('college_id', college_id)
    .eq('phone', phone)
    .gte('created_at', since)
    .limit(1);
  if (dup && dup.length) return NextResponse.json({ success: true, id: dup[0].id, duplicate: true });

  const onPlan = effectiveTier(college) !== 'free';
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('college_leads')
    .insert({
      college_id,
      name: String(name).trim(),
      phone,
      parent_phone: parentPhone || null,
      email: email ?? null,
      nata_score: nata_score ?? null,
      city: city ?? null,
      message: message ?? null,
      consent_given: true,
      firebase_uid: firebase_uid ?? null,
      lead_window_active: true,
      source: 'interested_button',
      status: 'new',
      admin_review_status: onPlan ? 'approved' : 'pending',
      admin_reviewed_at: onPlan ? now : null,
      admin_reviewed_by: onPlan ? 'auto: college on a plan' : null,
      delivered_at: onPlan ? now : null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: 'Could not send your enquiry. Please try again.' }, { status: 500 });

  if (onPlan) {
    await deliverLeadToCollege(db, {
      leadId: data.id,
      college: { id: college.id, name: college.name },
      student: { name: String(name).trim(), city: city ?? null, nataScore: typeof nata_score === 'number' ? nata_score : null },
      origin: request.nextUrl.origin,
    });
  }
  return NextResponse.json({ success: true, id: data.id, delivered: onPlan });
}
