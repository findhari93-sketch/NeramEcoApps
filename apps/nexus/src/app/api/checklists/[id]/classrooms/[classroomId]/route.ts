import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * DELETE /api/checklists/[id]/classrooms/[classroomId]
 * Unassign a checklist from a classroom.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; classroomId: string }> }
) {
  try {
    const { id, classroomId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await (supabase as any)
      .from('nexus_checklist_classrooms')
      .delete()
      .eq('checklist_id', id)
      .eq('classroom_id', classroomId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unassign classroom';
    console.error('Checklist classroom DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
