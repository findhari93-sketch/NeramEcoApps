import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { errorResponse } from '@/lib/api-errors';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { verifyMsToken } from '@/lib/ms-verify';
import { PadRefusal, callPad } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { rosterIds } from '@/lib/pad/sessions';
import { getRequestUser, staffRoleOf } from '@/lib/study-materials';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: { classId: string };
}

/**
 * GET /api/timetable/[classId]/answer-pad   (staff who can see the class, or an enrolled student)
 *
 * The Answer Pad rounds run in this class, for its After tab.
 *   - staff: every round, with its tiles (questions, average, who took part),
 *     whether its results are published, and the top five;
 *   - a student: published rounds only, each with their own result, the top
 *     five and the class average. Never anyone else's score.
 *
 * 200 { role: 'teacher' | 'student', rounds: [...] }
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    if (!isUuid(params.classId)) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    const authHeader = request.headers.get('Authorization');
    const user = await getRequestUser(authHeader);
    const supabase = getSupabaseAdminClient() as any;
    const isStaff = !!staffRoleOf(user);

    let classroomId: string;
    let batchId: string | null;
    if (isStaff) {
      const msUser = await verifyMsToken(authHeader);
      const access = await resolveClassStaffAccess<{ id: string; classroom_id: string; teacher_id: string | null; batch_id: string | null }>(
        supabase,
        msUser.oid,
        params.classId,
        'id, classroom_id, teacher_id, batch_id',
      );
      if ('error' in access) return access.error;
      classroomId = access.cls.classroom_id;
      batchId = access.cls.batch_id ?? null;
    } else {
      const { data: cls, error } = await supabase
        .from('nexus_scheduled_classes')
        .select('classroom_id, batch_id')
        .eq('id', params.classId)
        .maybeSingle();
      if (error) throw error;
      if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      classroomId = cls.classroom_id;
      batchId = cls.batch_id ?? null;
    }

    // The function checks enrollment for a student and staff for a teacher.
    const result = await callPad<{ rounds: unknown[] }>(supabase, 'pad_class_rounds', {
      p_actor: user.id,
      p_class: params.classId,
      p_roster: await rosterIds(classroomId, batchId),
      p_as: isStaff ? 'teacher' : 'student',
    });
    return NextResponse.json({ role: isStaff ? 'teacher' : 'student', rounds: result.rounds ?? [] });
  } catch (err) {
    if (err instanceof PadRefusal) {
      return NextResponse.json({ error: 'Not allowed', code: err.code }, { status: err.status });
    }
    return errorResponse(err, 'answer pad rounds');
  }
}
