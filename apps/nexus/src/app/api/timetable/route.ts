import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyClassCreated, notifyClassCancelled } from '@/lib/timetable-notifications';

const CLASS_SELECT = `*, topic:nexus_topics(id, title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url), batch:nexus_batches!nexus_scheduled_classes_batch_id_fkey(id, name)`;

/**
 * GET /api/timetable?classroom={id}&start={date}&end={date}
 *
 * Returns scheduled classes for a classroom within a date range.
 * For students: auto-filters by their batch (shows classroom-wide + their batch classes).
 * For teachers: shows all classes (optionally filtered by batch_id query param).
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');

    if (!classroomId || !start || !end) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Look up user and enrollment
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role, batch_id')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    let query = supabase
      .from('nexus_scheduled_classes')
      .select(CLASS_SELECT)
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });

    // For students: filter by their batch (show classroom-wide + their batch)
    if (enrollment.role === 'student') {
      if (enrollment.batch_id) {
        // Show classes where batch_id is null (classroom-wide) OR matches student's batch
        query = query.or(`batch_id.is.null,batch_id.eq.${enrollment.batch_id}`);
      } else {
        // Student has no batch assigned — only show classroom-wide classes
        query = query.is('batch_id', null);
      }
    } else {
      // Teachers: optionally filter by batch
      const batchFilter = request.nextUrl.searchParams.get('batch_id');
      if (batchFilter) {
        query = query.eq('batch_id', batchFilter);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ classes: data || [], role: enrollment.role });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load timetable';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * Helper: verify the caller is a teacher in the given classroom.
 * Returns { userId, msOid }
 */
async function verifyTeacherRole(msOid: string, classroomId: string) {
  const supabase = getSupabaseAdminClient();

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('ms_oid', msOid)
    .single();

  if (!user) throw new Error('User not found');

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', classroomId)
    .single();

  if (!enrollment || enrollment.role !== 'teacher') {
    throw new Error('Only teachers can manage the timetable');
  }

  return user.id;
}

/**
 * POST /api/timetable — Create a scheduled class (teacher only)
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { classroom_id, title, scheduled_date, start_time, end_time, topic_id, batch_id, create_teams_meeting } = body;

    if (!classroom_id || !title || !scheduled_date || !start_time || !end_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const teacherId = await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    const insertData: Record<string, unknown> = {
      classroom_id,
      title,
      scheduled_date,
      start_time,
      end_time,
      teacher_id: teacherId,
      topic_id: topic_id || null,
      batch_id: batch_id || null,
      status: 'scheduled',
    };

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .insert(insertData as any)
      .select(CLASS_SELECT)
      .single();

    if (error) throw error;

    // Notify students
    try {
      if (data) {
        await notifyClassCreated(classroom_id, title, scheduled_date, data.id);
      }
    } catch {
      // Don't fail creation if notification fails
    }

    return NextResponse.json({
      class: data,
      // Tell client whether to create a Teams meeting
      create_teams_meeting: !!create_teams_meeting,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create class';
    const status = message.includes('Only teachers') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/timetable — Update a scheduled class (teacher only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { id, classroom_id, ...updates } = body;

    if (!id || !classroom_id) {
      return NextResponse.json({ error: 'Missing id and classroom_id' }, { status: 400 });
    }

    await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    // Only allow updating specific fields
    const allowedFields = [
      'title', 'scheduled_date', 'start_time', 'end_time', 'topic_id', 'status',
      'teams_meeting_url', 'teams_meeting_id', 'teams_meeting_join_url',
      'batch_id', 'recording_url', 'transcript_url', 'notes', 'description',
    ];
    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .update(safeUpdates)
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .select(CLASS_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json({ class: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update class';
    const status = message.includes('Only teachers') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/timetable — Cancel or permanently delete a scheduled class (teacher only)
 * Pass { permanent: true } to hard-delete instead of soft-cancel.
 */
export async function DELETE(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id, classroom_id, permanent } = await request.json();

    if (!id || !classroom_id) {
      return NextResponse.json({ error: 'Missing id and classroom_id' }, { status: 400 });
    }

    await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    if (permanent) {
      // Hard delete — permanently remove from database
      const { error } = await supabase
        .from('nexus_scheduled_classes')
        .delete()
        .eq('id', id)
        .eq('classroom_id', classroom_id);

      if (error) throw error;

      return NextResponse.json({ deleted: true });
    }

    // Soft-delete: set status to cancelled
    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .select('*')
      .single();

    if (error) throw error;

    // Notify students
    try {
      if (data) {
        await notifyClassCancelled(classroom_id, data.title, data.scheduled_date, id);
      }
    } catch {
      // Don't fail cancellation if notification fails
    }

    return NextResponse.json({ class: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel class';
    const status = message.includes('Only teachers') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
