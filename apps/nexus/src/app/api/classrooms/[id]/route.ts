import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';

/**
 * GET /api/classrooms/[id]
 * Get classroom details with batches and enrollment counts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const [classroomResult, batchesResult, enrollmentsResult] = await Promise.all([
      supabase.from('nexus_classrooms').select('*').eq('id', id).single(),
      supabase.from('nexus_batches').select('*').eq('classroom_id', id).eq('is_active', true).order('name'),
      supabase
        .from('nexus_enrollments')
        .select('id, role, batch_id')
        .eq('classroom_id', id)
        .eq('is_active', true),
    ]);

    if (classroomResult.error) {
      if (classroomResult.error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
      }
      throw classroomResult.error;
    }

    // Count students per batch
    const batchStudentCounts: Record<string, number> = {};
    let unassignedCount = 0;
    let totalStudents = 0;
    let totalTeachers = 0;

    for (const e of enrollmentsResult.data || []) {
      if (e.role === 'student') {
        totalStudents++;
        if (e.batch_id) {
          batchStudentCounts[e.batch_id] = (batchStudentCounts[e.batch_id] || 0) + 1;
        } else {
          unassignedCount++;
        }
      } else {
        totalTeachers++;
      }
    }

    const batches = (batchesResult.data || []).map((b: any) => ({
      ...b,
      studentCount: batchStudentCounts[b.id] || 0,
    }));

    return NextResponse.json({
      classroom: classroomResult.data,
      batches,
      stats: { totalStudents, totalTeachers, unassignedCount },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load classroom';
    console.error('Classroom GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PUT /api/classrooms/[id]
 * Update classroom details.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    // Editing a classroom includes linking, unlinking and re-pointing its
    // Microsoft Team, which changes where every student's class actually lives.
    if (!canUser(user, 'structure.classroom.teams_link')) {
      return NextResponse.json(
        { error: 'Only the Neram team can change classroom settings.' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      name, type, description,
      ms_team_id, ms_team_name, ms_team_sync_enabled,
      ms_channel_id, ms_channel_name, ms_group_chat_id,
      is_active,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (ms_team_id !== undefined) updateData.ms_team_id = ms_team_id;
    if (ms_team_name !== undefined) updateData.ms_team_name = ms_team_name;
    if (ms_team_sync_enabled !== undefined) updateData.ms_team_sync_enabled = ms_team_sync_enabled;
    if (ms_channel_id !== undefined) updateData.ms_channel_id = ms_channel_id;
    if (ms_channel_name !== undefined) updateData.ms_channel_name = ms_channel_name;
    if (ms_group_chat_id !== undefined) updateData.ms_group_chat_id = ms_group_chat_id;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Clearing the team link should also clear its dependent channel link.
    if (ms_team_id === null) {
      updateData.ms_channel_id = null;
      updateData.ms_channel_name = null;
    }

    const { data: classroom, error } = await supabase
      .from('nexus_classrooms')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ classroom });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update classroom';
    console.error('Classroom PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/classrooms/[id]
 * Soft-delete (deactivate) a classroom. Admin only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    // Deactivating a classroom detaches a whole cohort and there is no undo in
    // the UI, so it stays with the admin, not the manager tier.
    if (!canUser(user, 'structure.classroom.delete')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { error } = await supabase
      .from('nexus_classrooms')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete classroom';
    console.error('Classroom DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
