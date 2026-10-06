/**
 * PATCH /api/question-bank/tutor-packs/[id]   body { status: 'reviewed' | 'retired' }
 *
 * Staff sign-off on an AI Tutor pack. Approve marks a VERIFIED pack
 * 'reviewed' (it keeps serving, now with a reviewer's name on it); Retire
 * takes any pack out of service. A draft cannot be approved: it failed the
 * answer-key checks, and the fix is to regenerate it, not to wave it through.
 *
 * Both write reviewed_by and reviewed_at, so a retired pack says who retired it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { describeError } from '@/lib/api-errors';
import { verifyQBStaff, type QBCaller } from '@/lib/qb-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let caller: QBCaller;
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    caller = access.caller;
  } catch (err) {
    console.error('[QB tutor packs] auth:', describeError(err));
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const next = body?.status;
  if (next !== 'reviewed' && next !== 'retired') {
    return NextResponse.json({ error: "status must be 'reviewed' or 'retired'" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data: current, error: readError } = await supabase
      .from('nexus_qb_tutor_packs')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (next === 'reviewed' && current.status !== 'verified' && current.status !== 'reviewed') {
      return NextResponse.json(
        { error: current.status === 'draft' ? 'A draft failed its checks. Regenerate it before approving.' : 'A retired pack cannot be approved.' },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('nexus_qb_tutor_packs')
      .update({ status: next, reviewed_by: caller.id, reviewed_at: now, updated_at: now })
      .eq('id', id)
      .select('id, status, reviewed_by, reviewed_at, updated_at')
      .single();
    if (error) {
      // 23505: the one-live-pack-per-question index; another pack already serves it.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Another pack already serves this question. Retire it first.' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[QB tutor packs] PATCH:', describeError(err));
    return NextResponse.json({ error: 'That did not save. Try again.' }, { status: 500 });
  }
}
