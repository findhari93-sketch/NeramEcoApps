export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, isFollowUpTopic, logDemoFollowUpOutcome, type FollowUpOutcome, type InterestLevel } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

const OUTCOMES: FollowUpOutcome[] = ['thinking', 'will_join', 'no_answer', 'not_interested', 'joined', 'message_sent'];

/**
 * POST /api/crm/follow-ups/[id]/outcome: log one call or WhatsApp message on a
 * follow-up, with what we sent and what they replied. Staff only (middleware).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(req);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const outcome = body.outcome as FollowUpOutcome;
  if (!OUTCOMES.includes(outcome)) return NextResponse.json({ error: 'Pick how the call went.' }, { status: 400 });
  const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  try {
    const supabase = getSupabaseAdminClient();
    const { data: me } = await (supabase as any).from('users').select('name').eq('id', adminId).maybeSingle();
    const res = await logDemoFollowUpOutcome(
      {
        callbackId: params.id,
        outcome,
        nextAt: str(body.nextAt, 40) || null,
        note: str(body.note, 1000) || null,
        reason: str(body.reason, 300) || null,
        interest,
        channel: body.channel === 'whatsapp' ? 'whatsapp' : 'call',
        topic: isFollowUpTopic(body.topic) ? body.topic : null,
        messageSent: str(body.messageSent, 2000) || null,
        reply: str(body.reply, 2000) || null,
        admin: { id: adminId, name: me?.name || 'Staff' },
      },
      supabase,
    );
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('follow-up outcome failed:', error);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
}
