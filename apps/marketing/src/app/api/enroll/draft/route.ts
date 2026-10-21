// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getDirectEnrollmentLinkByToken } from '@neram/database';
import { normaliseDraft, resumeStateFor } from '@neram/database/enrolment-draft';
import { verifyFirebaseToken } from '../../_lib/auth';

/**
 * The enrolment wizard's draft, so a student continues from any device.
 *
 *   GET    ?token=   what this signed-in student may resume: the application
 *                    they saved with "pay later" and the draft they typed.
 *   PUT    { token, step, formData }   checkpoint the draft on the link.
 *   DELETE ?token=   "start over": clear the draft this student wrote.
 *
 * All three need a Firebase sign-in. Reads never reveal another account's
 * data; the saved application and the draft have separate owners.
 */

const isOpen = (link: any) => link && link.status === 'active' && new Date(link.expires_at) >= new Date();

export async function GET(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  try {
    const supabase = createAdminClient();
    const link = await getDirectEnrollmentLinkByToken(token, supabase);
    if (!isOpen(link)) {
      return NextResponse.json({ success: true, data: { saved: null, draft: null, linkStatus: link?.status || null } });
    }
    const state = resumeStateFor(link, auth.userId);
    return NextResponse.json({ success: true, data: { ...state, linkStatus: 'active' } });
  } catch (error: any) {
    console.error('[enroll/draft] read failed:', error?.message);
    return NextResponse.json({ error: 'Could not load your saved details.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  const draft = normaliseDraft(body);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });
  try {
    const supabase = createAdminClient();
    const link = await getDirectEnrollmentLinkByToken(body.token, supabase);
    if (!isOpen(link)) return NextResponse.json({ error: 'This link is no longer open.', code: 'NOT_ACTIVE' }, { status: 409 });
    const savedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('direct_enrollment_links')
      .update({ draft_form: draft.draft.form, draft_step: draft.draft.step, draft_saved_at: savedAt, draft_user_id: auth.userId })
      .eq('id', link.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'This link is no longer open.', code: 'NOT_ACTIVE' }, { status: 409 });
    return NextResponse.json({ success: true, data: { savedAt } });
  } catch (error: any) {
    console.error('[enroll/draft] save failed:', error?.message);
    return NextResponse.json({ error: 'Could not save your progress.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  try {
    const supabase = createAdminClient();
    const link = await getDirectEnrollmentLinkByToken(token, supabase);
    if (!link) return NextResponse.json({ success: true });
    // Only the draft's own author clears it; the saved application is untouched.
    const { error } = await supabase
      .from('direct_enrollment_links')
      .update({ draft_form: null, draft_step: null, draft_saved_at: null, draft_user_id: null })
      .eq('id', link.id)
      .eq('draft_user_id', auth.userId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[enroll/draft] clear failed:', error?.message);
    return NextResponse.json({ error: 'Could not clear your draft.' }, { status: 500 });
  }
}
