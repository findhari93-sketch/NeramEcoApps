import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient, recordClassPrepReason } from '@neram/database';
import { isPreworkReasonCode } from '@/lib/prework-reasons';

/**
 * "I cannot do this before the class, here is why."
 *
 * A reason OPENS the door. That is the whole point of it, and the alternative was
 * considered and rejected: if a reason only logged and still refused entry, the
 * honest description of this feature would be "we lock students out and let them
 * explain why they are locked out". The blockers stay on the record and the
 * teacher still sees exactly what was not done.
 *
 * This keeps what the old prework comment got right, that locking a student out
 * of a class over homework converts a homework problem into an attendance
 * problem, while still producing the accountability the gate exists for.
 *
 * Stored on nexus_class_prep_state rather than nexus_prework_reasons because that
 * table's assignment_id is NOT NULL and the test half of the gate has no
 * assignment to hang a reason on. The VOCABULARY is shared, so a teacher's tally
 * stays one set of words.
 */

interface Ctx {
  params: { classId: string };
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdminClient() as any;

    const code = body?.reason_code;
    if (!isPreworkReasonCode(code)) {
      return NextResponse.json({ error: 'Pick a reason' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, classroom_id')
      .eq('id', params.classId)
      .maybeSingle();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', cls.classroom_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });

    const state = await recordClassPrepReason(
      user.id,
      params.classId,
      cls.classroom_id,
      { code: code as any, note: typeof body.reason_note === 'string' ? body.reason_note : null },
      supabase,
    );

    return NextResponse.json({
      recorded: true,
      unlocked: !!state?.unlocked_at,
      unlocked_via: state?.unlocked_via ?? null,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to record your reason');
  }
}
