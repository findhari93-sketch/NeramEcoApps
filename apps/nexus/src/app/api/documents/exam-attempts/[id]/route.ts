import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PATCH /api/documents/exam-attempts/[id]
 * Update an exam attempt's state, exam_date_id, or completion date
 * Body: { state?, exam_date_id?, exam_completed_at?, application_date? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { id } = await params;
    const body = await request.json();

    const db = supabase as any;

    // Verify ownership (students own their records; teachers can restore)
    const { data: existing } = await db
      .from('nexus_student_exam_attempts')
      .select('student_id, classroom_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Soft delete action
    if (body.action === 'delete') {
      if (existing.student_id !== user.id) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      const { data, error } = await db
        .from('nexus_student_exam_attempts')
        .update({
          deleted_at: new Date().toISOString(),
          deletion_reason: body.deletion_reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ attempt: data });
    }

    // Restore action (student re-adds, or teacher restores)
    if (body.action === 'restore') {
      // Allow student to restore own record, or teacher in same classroom
      const { data: enrollment } = await db
        .from('nexus_enrollments')
        .select('role')
        .eq('user_id', user.id)
        .eq('classroom_id', existing.classroom_id)
        .eq('is_active', true)
        .single();
      const isOwner = existing.student_id === user.id;
      const isTeacher = enrollment?.role === 'teacher' || enrollment?.role === 'admin';
      if (!isOwner && !isTeacher) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      const { data, error } = await db
        .from('nexus_student_exam_attempts')
        .update({
          deleted_at: null,
          deletion_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ attempt: data });
    }

    // Standard field update
    if (existing.student_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const allowedFields = ['state', 'exam_date_id', 'exam_completed_at', 'application_date', 'notes', 'exam_city', 'exam_session'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Auto-resolve exam_date from exam_date_id if being updated
    if (body.exam_date_id) {
      const { data: dateRow } = await db
        .from('nexus_exam_dates')
        .select('exam_date')
        .eq('id', body.exam_date_id)
        .single();
      if (dateRow) updates.exam_date = dateRow.exam_date?.split('T')[0] || dateRow.exam_date;
    }

    const { data, error } = await db
      .from('nexus_student_exam_attempts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ attempt: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update attempt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
