import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getSupabaseAdminClient } from '@neram/database';
import { HEALTH_CLEARS_TABLE, HEALTH_CLEARS_UNAVAILABLE, isMissingTableError } from '@/lib/test-health-clears';

const MAX_NOTE = 500;

/**
 * POST   /api/question-bank/tests/[id]/health/clear   (staff)  Mark as fixed
 * DELETE /api/question-bank/tests/[id]/health/clear   (staff)  Undo the latest
 *
 * A teacher saying "the app problems on this paper are dealt with". The health
 * route then counts only failures recorded after the latest clear, so the banner
 * goes quiet and comes back the moment a student hits something new.
 *
 * Nothing in nexus_test_attempt_errors is deleted. That table is diagnostics;
 * clearing is a view over it.
 *
 * Same authorisation as the health route it clears: any staff tier.
 */
async function staffOnly(request: NextRequest) {
  const access = await verifyQBAccess(request.headers.get('Authorization'), null);
  if (!access.ok) return { response: access.response };
  if (resolveStaffRole(access.caller) === null) {
    return { response: NextResponse.json({ error: 'Only staff can mark a paper as fixed' }, { status: 403 }) };
  }
  return { caller: access.caller };
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await staffOnly(request);
    if (!gate.caller) return gate.response;

    const body = await request.json().catch(() => ({}));
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, MAX_NOTE) : null;

    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from(HEALTH_CLEARS_TABLE)
      .insert({ test_id: params.id, cleared_by: gate.caller.id, note })
      .select('id, test_id, cleared_at, cleared_by, note')
      .single();

    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ error: HEALTH_CLEARS_UNAVAILABLE }, { status: 503 });
      // 23503 foreign_key_violation (no such paper); 22P02 an id that is not a uuid.
      if (error.code === '23503' || error.code === '22P02') {
        return NextResponse.json({ error: 'Test not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ data: { clear: data } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as any)?.message || 'Could not mark this paper as fixed';
    console.error('Test health clear error:', message);
    return NextResponse.json({ error: 'Could not mark this paper as fixed. Try again.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await staffOnly(request);
    if (!gate.caller) return gate.response;

    const supabase = getSupabaseAdminClient() as any;
    const { data: latest, error: readErr } = await supabase
      .from(HEALTH_CLEARS_TABLE)
      .select('id')
      .eq('test_id', params.id)
      .order('cleared_at', { ascending: false })
      .limit(1);

    if (readErr) {
      if (isMissingTableError(readErr)) return NextResponse.json({ error: HEALTH_CLEARS_UNAVAILABLE }, { status: 503 });
      if (readErr.code === '22P02') return NextResponse.json({ error: 'Test not found' }, { status: 404 });
      throw readErr;
    }

    const target = Array.isArray(latest) ? latest[0] : null;
    if (!target?.id) {
      return NextResponse.json({ error: 'This paper has not been marked as fixed, so there is nothing to undo.' }, { status: 404 });
    }

    // Scoped to the paper as well as the id, so a stale id can never remove
    // another paper's clear.
    const { error: delErr } = await supabase
      .from(HEALTH_CLEARS_TABLE)
      .delete()
      .eq('id', target.id)
      .eq('test_id', params.id);
    if (delErr) throw delErr;

    return NextResponse.json({ data: { removed: target.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as any)?.message || 'Could not undo';
    console.error('Test health clear undo error:', message);
    return NextResponse.json({ error: 'Could not undo marking this paper as fixed. Try again.' }, { status: 500 });
  }
}
