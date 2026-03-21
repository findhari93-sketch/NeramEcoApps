import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, createUserNotification, removeEnrollments } from '@neram/database';
import { addMemberToTeam } from '@/lib/teams-sync';
import type { RemovalReasonCategory } from '@neram/database';

/**
 * GET /api/classrooms/[id]/enrollments?batch={batchId}&role={teacher|student}
 * List enrollments with user details and batch info.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const batchId = request.nextUrl.searchParams.get('batch');
    const role = request.nextUrl.searchParams.get('role');

    let query = supabase
      .from('nexus_enrollments')
      .select('*, user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url, user_type, ms_oid), batch:nexus_batches(id, name)')
      .eq('classroom_id', id)
      .eq('is_active', true);

    if (batchId) {
      if (batchId === 'unassigned') {
        query = query.is('batch_id', null);
      } else {
        query = query.eq('batch_id', batchId);
      }
    }

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query.order('enrolled_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ enrollments: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load enrollments';
    console.error('Enrollments GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/classrooms/[id]/enrollments
 * Enroll a user into the classroom.
 *
 * Body (existing user):  { user_id, role, batch_id? }
 * Body (directory user): { ms_oid, name, email, role, batch_id?, user_type? }
 *
 * When ms_oid is provided, auto-creates the user in the DB if they don't exist yet.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { role, batch_id } = body;

    if (!role) {
      return NextResponse.json({ error: 'role is required' }, { status: 400 });
    }

    let resolvedUserId: string;

    if (body.user_id) {
      // Existing user flow
      resolvedUserId = body.user_id;
    } else if (body.ms_oid && body.name && body.email) {
      // Directory user flow — find or create
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('ms_oid', body.ms_oid)
        .single();

      if (existing) {
        resolvedUserId = existing.id;
      } else {
        // Auto-create user from directory info
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            name: body.name,
            email: body.email,
            ms_oid: body.ms_oid,
            user_type: body.user_type || 'student',
            status: 'active',
            email_verified: true,
            phone_verified: false,
            preferred_language: 'en',
          })
          .select('id')
          .single();

        if (createError) throw createError;
        resolvedUserId = newUser.id;
      }
    } else {
      return NextResponse.json(
        { error: 'Either user_id or (ms_oid + name + email) is required' },
        { status: 400 }
      );
    }

    const { data: enrollment, error } = await supabase
      .from('nexus_enrollments')
      .upsert(
        { user_id: resolvedUserId, classroom_id: id, role, batch_id: batch_id || null, is_active: true },
        { onConflict: 'user_id,classroom_id' }
      )
      .select('*, user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url), batch:nexus_batches(id, name)')
      .single();

    if (error) throw error;

    // Non-blocking: auto-add to Teams team if sync is enabled
    // Also sync to Common classroom's Teams team (cross-classroom visibility)
    const userMsOid = body.ms_oid || null;
    if (userMsOid) {
      const { data: classroomConfig } = await supabase
        .from('nexus_classrooms')
        .select('ms_team_id, ms_team_sync_enabled, name')
        .eq('id', id)
        .single();

      if (classroomConfig?.ms_team_id && classroomConfig?.ms_team_sync_enabled) {
        addMemberToTeam(classroomConfig.ms_team_id, userMsOid).catch((err: unknown) =>
          console.error('[Teams auto-sync] Failed to add member:', err)
        );
      }

      // Also add to Common Teams team (the DB trigger auto-enrolls in Common classroom,
      // but can't call external APIs — so we sync to Common team here)
      if (role === 'student') {
        const { data: commonClassroom } = await supabase
          .from('nexus_classrooms')
          .select('ms_team_id, ms_team_sync_enabled')
          .eq('type', 'common')
          .eq('is_active', true)
          .single();

        if (commonClassroom?.ms_team_id && commonClassroom?.ms_team_sync_enabled) {
          addMemberToTeam(commonClassroom.ms_team_id, userMsOid).catch((err: unknown) =>
            console.error('[Teams auto-sync] Failed to add member to Common team:', err)
          );
        }
      }
    }

    // Send notification to the enrolled user
    try {
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('name')
        .eq('id', id)
        .single();
      const classroomName = classroom?.name || 'a classroom';

      await createUserNotification(
        {
          user_id: resolvedUserId,
          event_type: 'classroom_enrolled',
          title: 'Added to Classroom',
          message: `You have been added to "${classroomName}" as a ${role}.`,
          metadata: { classroom_id: id, classroom_name: classroomName, role },
        },
        supabase
      );
    } catch (notifErr) {
      console.warn('Failed to send enrollment notification:', notifErr);
    }

    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to enroll user';
    console.error('Enrollments POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/classrooms/[id]/enrollments
 * Bulk update batch assignments.
 * Body: { enrollment_ids: string[], batch_id: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
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

    const body = await request.json();
    const { enrollment_ids, batch_id } = body;

    if (!enrollment_ids || !Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
      return NextResponse.json({ error: 'enrollment_ids array is required' }, { status: 400 });
    }

    // Get current enrollments before update to detect batch changes
    const { data: currentEnrollments } = await supabase
      .from('nexus_enrollments')
      .select('id, user_id, batch_id, classroom_id')
      .in('id', enrollment_ids);

    const { data, error } = await supabase
      .from('nexus_enrollments')
      .update({ batch_id: batch_id || null })
      .in('id', enrollment_ids)
      .select();

    if (error) throw error;

    // Send notifications to affected students
    if (currentEnrollments && currentEnrollments.length > 0 && batch_id) {
      try {
        const classroomId = currentEnrollments[0].classroom_id;
        const { data: classroom } = await supabase
          .from('nexus_classrooms')
          .select('name')
          .eq('id', classroomId)
          .single();
        const { data: batch } = await supabase
          .from('nexus_batches')
          .select('name')
          .eq('id', batch_id)
          .single();

        const classroomName = classroom?.name || 'a classroom';
        const batchName = batch?.name || 'a batch';

        const notifications = currentEnrollments
          .filter((e: any) => e.batch_id !== batch_id)
          .map((e: any) =>
            createUserNotification(
              {
                user_id: e.user_id,
                event_type: e.batch_id ? 'batch_changed' : 'batch_assigned',
                title: e.batch_id ? 'Batch Changed' : 'Assigned to Batch',
                message: e.batch_id
                  ? `You have been moved to "${batchName}" in "${classroomName}".`
                  : `You have been assigned to "${batchName}" in "${classroomName}".`,
                metadata: {
                  classroom_id: classroomId,
                  classroom_name: classroomName,
                  batch_id,
                  batch_name: batchName,
                },
              },
              supabase
            )
          );

        await Promise.allSettled(notifications);
      } catch (notifErr) {
        console.warn('Failed to send batch notifications:', notifErr);
      }
    }

    return NextResponse.json({ updated: data?.length || 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update enrollments';
    console.error('Enrollments PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/classrooms/[id]/enrollments
 * Remove students from classroom (soft-delete with audit trail).
 * Body: { enrollment_ids: string[], reason_category: RemovalReasonCategory, notes?: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { enrollment_ids, reason_category, notes } = body;

    if (!enrollment_ids || !Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
      return NextResponse.json({ error: 'enrollment_ids array is required' }, { status: 400 });
    }

    const validReasons: RemovalReasonCategory[] = [
      'fee_nonpayment', 'course_completed', 'college_admitted',
      'self_withdrawal', 'disciplinary', 'other',
    ];
    if (!reason_category || !validReasons.includes(reason_category)) {
      return NextResponse.json({ error: 'Valid reason_category is required' }, { status: 400 });
    }

    if (reason_category === 'other' && !notes) {
      return NextResponse.json({ error: 'Notes are required when reason is "other"' }, { status: 400 });
    }

    const removed = await removeEnrollments(
      enrollment_ids,
      id,
      caller.id,
      reason_category as RemovalReasonCategory,
      notes || null,
      supabase
    );

    // Send notifications to removed students
    try {
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('name')
        .eq('id', id)
        .single();
      const classroomName = classroom?.name || 'a classroom';

      // Get user_ids for removed enrollments
      const { data: removedEnrollments } = await supabase
        .from('nexus_enrollments')
        .select('user_id')
        .in('id', enrollment_ids);

      if (removedEnrollments) {
        const notifications = removedEnrollments.map((e: any) =>
          createUserNotification(
            {
              user_id: e.user_id,
              event_type: 'classroom_removed',
              title: 'Removed from Classroom',
              message: `You have been removed from "${classroomName}".`,
              metadata: { classroom_id: id, classroom_name: classroomName, reason_category },
            },
            supabase
          )
        );
        await Promise.allSettled(notifications);
      }
    } catch (notifErr) {
      console.warn('Failed to send removal notifications:', notifErr);
    }

    return NextResponse.json({ removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove students';
    console.error('Enrollments DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
