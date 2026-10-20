export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getIntentById, attemptStatusView, cancelAttempt } from '@neram/database/payments';
import type { PaymentAttemptRow } from '@neram/database';
import { verifyFirebaseToken } from '../../../_lib/auth';
import { ownsIntent } from '../../_lib/owner';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(request: NextRequest, id: string) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return { response: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  if (!UUID.test(id)) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any).from('payment_attempts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  // payments v2 tables are not in the generated types yet; the row shape is ours.
  const attempt = data as unknown as PaymentAttemptRow | null;
  if (!attempt) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const intent = await getIntentById(supabase, attempt.intent_id);
  if (!intent || !ownsIntent(intent, auth.userId)) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { supabase, attempt, intent, auth };
}

/**
 * GET /api/payments/attempts/[id] (Firebase auth, owner only)
 * What the paying page polls: state, the exact amount, the deadline, and
 * whether the student is now enrolled (the link became 'used').
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await Promise.resolve(params as any);
  try {
    const got = await load(request, id);
    if ('response' in got) return got.response;
    const { supabase, attempt, intent } = got;
    let link: { status?: string | null } | null = null;
    if (intent.enrollment_link_id) {
      const { data } = await supabase.from('direct_enrollment_links').select('status').eq('id', intent.enrollment_link_id).maybeSingle();
      link = data;
    }
    return NextResponse.json({ success: true, data: { attemptId: attempt.id, ...attemptStatusView(attempt, intent, link) } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[payments/attempts/[id]] failed:', error?.message);
    return NextResponse.json({ error: 'Could not read the payment.' }, { status: 500 });
  }
}

/** POST /api/payments/attempts/[id] { action: 'cancel' }: the student walked away from an open order. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await Promise.resolve(params as any);
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  try {
    const got = await load(request, id);
    if ('response' in got) return got.response;
    const result = await cancelAttempt(got.supabase, { attemptId: id, actor: { type: 'student', id: got.auth.userId } });
    return NextResponse.json({ success: result.ok, state: result.ok ? result.attempt.state : result.state || null });
  } catch (error: any) {
    console.error('[payments/attempts/[id]] cancel failed:', error?.message);
    return NextResponse.json({ error: 'Could not cancel.' }, { status: 500 });
  }
}
