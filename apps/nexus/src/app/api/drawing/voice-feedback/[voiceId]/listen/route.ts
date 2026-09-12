import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { recordVoiceListen } from '@/lib/drawing-voice-feedback';

/**
 * POST /api/drawing/voice-feedback/[voiceId]/listen   { position_ms, ended, started }
 *
 * The student's player reports how far they got, so the teacher can see "Heard"
 * or "Not heard yet" before chasing a redo. Only the student the note was sent to
 * can write it, and only once it has actually been sent.
 *
 * A View as Student session is a teacher looking through the student's eyes. It
 * must never mark a note heard on the student's behalf, so it is accepted and
 * ignored rather than refused: the player should not show an error for it.
 */

type Ctx = { params: Promise<{ voiceId: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);
    const { voiceId } = await params;

    if (extractBearerToken(authHeader)?.startsWith('imp_')) {
      return NextResponse.json({ ok: true, recorded: false });
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const body = await request.json().catch(() => ({}) as any);
    const row = await recordVoiceListen(voiceId, user.id, {
      positionMs: Number(body?.position_ms),
      ended: body?.ended === true,
      started: body?.started === true,
    });
    if (!row) return NextResponse.json({ error: 'Voice note not found' }, { status: 404 });

    return NextResponse.json({ ok: true, recorded: true, heard_fully_at: row.heard_fully_at });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not record the listen';
    const isAuth = /authorization|token|auth/i.test(message);
    if (!isAuth) console.error('Voice listen POST error:', message);
    return NextResponse.json({ error: message }, { status: isAuth ? 401 : 500 });
  }
}
