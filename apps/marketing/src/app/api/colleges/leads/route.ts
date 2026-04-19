// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { sendLeadNotificationToCollege } from '@/lib/college-outreach/lead-notification';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { college_id, name, phone, email, nata_score, city, message, consent_given, firebase_uid } = body;

    if (!college_id || !name || !phone || !consent_given) {
      return NextResponse.json({ error: 'Required: college_id, name, phone, consent_given=true' }, { status: 400 });
    }
    if (!phone.match(/^[6-9]\d{9}$/)) {
      return NextResponse.json({ error: 'Valid 10-digit Indian mobile number required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('college_leads')
      .insert({
        college_id, name, phone,
        email: email ?? null,
        nata_score: nata_score ?? null,
        city: city ?? null,
        message: message ?? null,
        consent_given: true,
        firebase_uid: firebase_uid ?? null,
        lead_window_active: true,
        source: 'interested_button',
        status: 'new',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort lead notification to college. Do not block or fail on email errors.
    sendLeadNotificationToCollegeSafely({
      collegeId: college_id,
      studentName: name,
      studentPhone: phone,
      studentEmail: email ?? null,
      studentCity: city ?? null,
      studentNataScore: typeof nata_score === 'number' ? nata_score : null,
      studentMessage: message ?? null,
    }).catch((err) => {
      console.error('[leads] failed to notify college:', err);
    });

    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// Fire-and-forget notification helper. Looks up college contact + tier, then sends.
async function sendLeadNotificationToCollegeSafely(args: {
  collegeId: string;
  studentName: string;
  studentPhone: string;
  studentEmail: string | null;
  studentCity: string | null;
  studentNataScore: number | null;
  studentMessage: string | null;
}) {
  const supabase = createAdminClient();
  const { data: college } = await supabase
    .from('colleges')
    .select('name, slug, state_slug, email, admissions_email, neram_tier')
    .eq('id', args.collegeId)
    .single();

  if (!college) return;

  const to = (college.admissions_email || college.email) ?? null;
  if (!to) {
    console.warn(`[leads] college ${args.collegeId} has no email on record, skipping notification`);
    return;
  }

  const collegePageUrl = `https://neramclasses.com/en/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

  await sendLeadNotificationToCollege({
    to,
    collegeName: college.name,
    collegePageUrl,
    studentName: args.studentName,
    studentPhone: args.studentPhone,
    studentEmail: args.studentEmail,
    studentCity: args.studentCity,
    studentNataScore: args.studentNataScore,
    studentMessage: args.studentMessage,
    neramTier: college.neram_tier,
  });
}
