import { NextRequest, NextResponse } from 'next/server';
import { refuseUnlessStudent, verifyQBAccess } from '@/lib/qb-auth';
import { getSupabaseAdminClient } from '@neram/database';
import { isTestReasonCode, testReasonRequiresNote } from '@/lib/test-reasons';

/** Long enough for a real bug report, short enough not to be a storage problem. */
const MAX_NOTE = 1000;

/**
 * POST /api/student/tests/reasons   (student)
 *
 * A student says why a test did not get done. Two shapes, one vocabulary:
 *
 *   { attempt_id, reason_code, reason_note? }              I started and stopped
 *   { test_id, placement_id?, reason_code, reason_note? }  I am not going to do it
 *
 * WHY A REASON IS NOT AN EXCUSE. Recording one changes nothing about the test:
 * no deadline moves, no requirement is lifted, no gate opens. The door stays
 * open and the work stays owed, exactly as with the class prep gate. What it
 * changes is what the teacher KNOWS, and specifically whether the answer is
 * "this paper is broken" rather than "this student is lazy", which the old
 * "0 attempts" display made indistinguishable.
 *
 * Ownership is enforced by matching student_id on the attempt, not by trusting
 * the id in the body. Without that, any student could annotate any other
 * student's abandoned attempt.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const access = await verifyQBAccess(request.headers.get('Authorization'), body?.classroom_id ?? null);
    if (!access.ok) return access.response;
    const { caller } = access;

    // Staff have nothing to explain here, and a staff row would pollute the
    // teacher's own tally of who is struggling.
    const notAStudent = refuseUnlessStudent(caller);
    if (notAStudent) return notAStudent;

    const code = body?.reason_code;
    if (!isTestReasonCode(code)) {
      return NextResponse.json({ error: 'reason_code is not one we recognise' }, { status: 400 });
    }

    const note = typeof body?.reason_note === 'string' ? body.reason_note.trim().slice(0, MAX_NOTE) : '';
    // Enforced server-side as well as in the sheet. "Something went wrong" with
    // no detail is a row that costs a teacher time and tells them nothing, and
    // the client is not the security boundary.
    if (testReasonRequiresNote(code) && note.length === 0) {
      return NextResponse.json({ error: 'That reason needs a short note saying what happened' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // ── I started and stopped ────────────────────────────────────────────────
    if (typeof body?.attempt_id === 'string' && body.attempt_id) {
      const { data: attempt, error: findErr } = await supabase
        .from('nexus_test_attempts')
        .select('id, student_id, status')
        .eq('id', body.attempt_id)
        .eq('student_id', caller.id)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!attempt) return NextResponse.json({ error: 'That attempt is not yours' }, { status: 403 });

      // A submitted paper has no unfinished story to tell, and letting a reason
      // land on one would put "I ran out of time" next to a score.
      if (attempt.status !== 'abandoned' && attempt.status !== 'expired') {
        return NextResponse.json({ error: 'That attempt was not left unfinished' }, { status: 400 });
      }

      const { error } = await supabase
        .from('nexus_test_attempts')
        .update({
          abandon_reason_code: code,
          abandon_reason_note: note || null,
          abandon_reason_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)
        .eq('student_id', caller.id);
      if (error) throw error;

      return NextResponse.json({ data: { recorded: 'abandon' } }, { status: 201 });
    }

    // ── I am not going to do it ──────────────────────────────────────────────
    if (typeof body?.test_id === 'string' && body.test_id) {
      const placementId = typeof body?.placement_id === 'string' && body.placement_id ? body.placement_id : null;

      const { data: test, error: testErr } = await supabase
        .from('nexus_tests')
        .select('id, is_active')
        .eq('id', body.test_id)
        .maybeSingle();
      if (testErr) throw testErr;
      if (!test || !test.is_active) return NextResponse.json({ error: 'That test does not exist' }, { status: 404 });

      // Upsert on the identity the two partial unique indexes define, so a
      // student changing their mind updates their row rather than stacking a
      // second one. See migration 20260824090100 for why NULL placement_id
      // needs its own index.
      const existingQuery = supabase
        .from('nexus_test_skip_reasons')
        .select('id')
        .eq('student_id', caller.id)
        .eq('test_id', test.id);
      const { data: existing } = await (placementId
        ? existingQuery.eq('placement_id', placementId)
        : existingQuery.is('placement_id', null)
      ).maybeSingle();

      const row = {
        student_id: caller.id,
        test_id: test.id,
        placement_id: placementId,
        classroom_id: body?.classroom_id ?? null,
        reason_code: code,
        reason_note: note || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = existing
        ? await supabase.from('nexus_test_skip_reasons').update(row).eq('id', existing.id)
        : await supabase.from('nexus_test_skip_reasons').insert(row);
      if (error) throw error;

      return NextResponse.json({ data: { recorded: 'skip' } }, { status: 201 });
    }

    return NextResponse.json({ error: 'Either attempt_id or test_id is required' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not record that reason';
    console.error('Test reason POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
