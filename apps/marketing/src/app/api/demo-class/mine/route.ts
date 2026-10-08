export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getLatestDemoRequestForUser,
  getActiveDemoRequestForUser,
  updateDemoRequest,
  logDemoRequestEvent,
  cancelPendingDemoMessages,
  isOfferedPreference,
  formatDemoPreference,
  dispatchNotification,
  type DemoWindow,
} from '@neram/database';
import { verifyFirebaseToken } from '../../_lib/auth';
import { loadDemoSettings, toPublicDemoRequest } from '@/lib/demo-request';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** GET /api/demo-class/mine: the signed-in student's latest demo request (or null). */
export async function GET(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ request: null, signedIn: false }, { headers: NO_STORE });
  try {
    const [r, settings] = await Promise.all([getLatestDemoRequestForUser(auth.userId), loadDemoSettings()]);
    return NextResponse.json({ request: r ? toPublicDemoRequest(r, settings) : null, signedIn: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('demo mine failed:', error);
    return NextResponse.json({ error: 'Could not load your demo' }, { status: 500, headers: NO_STORE });
  }
}

/**
 * PATCH /api/demo-class/mine  { action: 'change_preference', date, window } | { action: 'cancel', reason? }
 *
 * A student can change the day/time they asked for until staff confirm it, and
 * cancel at any point. Cancelling a confirmed demo leaves the Teams meeting for
 * the admin cron to cancel (marketing holds no Microsoft credentials).
 */
export async function PATCH(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const r = await getActiveDemoRequestForUser(auth.userId, supabase);
    if (!r) return NextResponse.json({ error: 'You have no open demo request.' }, { status: 404 });
    const settings = await loadDemoSettings();

    if (body.action === 'change_preference') {
      if (r.status === 'approved') {
        return NextResponse.json(
          { error: 'Your demo is already confirmed. Call or WhatsApp us to move it.' },
          { status: 409 },
        );
      }
      const window = String(body.window || '') as DemoWindow;
      const date = window === 'anytime' ? null : String(body.date || '') || null;
      if (!isOfferedPreference(new Date(), date, window, settings.schedule)) {
        return NextResponse.json({ error: 'That time is no longer available. Please pick another.' }, { status: 400 });
      }
      const updated = await updateDemoRequest(r.id, { preferred_date: date, preferred_window: window }, supabase);
      await logDemoRequestEvent(
        {
          registration_id: r.id,
          kind: 'note',
          outcome: 'student_changed_time',
          note: `Student changed the time to ${formatDemoPreference(date, window, settings.schedule)}`,
          actor_id: auth.userId,
        },
        supabase,
      );
      return NextResponse.json({ request: toPublicDemoRequest(updated, settings) });
    }

    if (body.action === 'cancel') {
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : 'No reason given';
      const updated = await updateDemoRequest(
        r.id,
        { status: 'cancelled', cancel_reason: `Cancelled by the student: ${reason}`, next_contact_at: null },
        supabase,
      );
      await cancelPendingDemoMessages(r.id, undefined, supabase);
      await logDemoRequestEvent(
        { registration_id: r.id, kind: 'status', outcome: 'cancelled_by_student', note: reason, actor_id: auth.userId },
        supabase,
      );
      await dispatchNotification({
        type: 'demo_registration',
        title: 'Demo cancelled by student',
        message: `${r.name} (${r.ref_code}) cancelled their demo. Reason: ${reason}`,
        data: { user_name: r.name, phone: r.phone, ref_code: r.ref_code, registration_id: r.id },
      }).catch(() => {});
      return NextResponse.json({ request: toPublicDemoRequest(updated, settings) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('demo mine update failed:', error);
    return NextResponse.json({ error: 'Could not update your demo. Please try again.' }, { status: 500 });
  }
}
