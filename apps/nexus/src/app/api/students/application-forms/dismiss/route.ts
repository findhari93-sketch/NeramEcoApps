import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/students/application-forms/dismiss
 * Body: { classroomId, studentId, formUserId }
 *
 * "Not this student." Records that a proposed form belongs to someone else, so the
 * Students screen stops offering it to every teacher who opens it. Nothing else
 * changes, and linking the same form later removes the note.
 *
 * Same capability as linking: deciding who a record belongs to is one judgement,
 * and a wrong dismissal hides a real form.
 */
export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(staff, 'structure.student.account');

    const body = await request.json().catch(() => ({}));
    const { classroomId, studentId, formUserId } = (body ?? {}) as Record<string, unknown>;
    if (![classroomId, studentId, formUserId].every((value) => typeof value === 'string' && UUID.test(value))) {
      return NextResponse.json({ error: 'classroomId, studentId and formUserId are required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: enrollment, error: enrollmentError } = await supabase
      .from('nexus_enrollments')
      .select('id')
      .eq('classroom_id', classroomId)
      .eq('user_id', studentId)
      .eq('role', 'student')
      .eq('is_active', true)
      .maybeSingle();
    if (enrollmentError) throw enrollmentError;
    if (!enrollment) {
      return NextResponse.json({ error: 'That student is not in this classroom.' }, { status: 404 });
    }

    const { error } = await supabase
      .from('nexus_application_form_dismissals')
      .upsert(
        { student_id: studentId, form_user_id: formUserId, dismissed_by: staff.id },
        { onConflict: 'student_id,form_user_id', ignoreDuplicates: true },
      );
    if (error) throw error;

    return NextResponse.json({ dismissed: true });
  } catch (err) {
    return errorResponse(err, 'Failed to save that');
  }
}
