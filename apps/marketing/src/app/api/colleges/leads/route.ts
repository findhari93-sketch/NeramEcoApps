// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

// Student submits "I'm Interested" on a college page. Lead is inserted with
// admin_review_status='pending'. No email is sent to the college yet; the
// Neram staff reviews each lead in the admin app and the approve action there
// triggers the notification email.
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
        // Always land in admin queue. College won't see this until Neram staff approves.
        admin_review_status: 'pending',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
