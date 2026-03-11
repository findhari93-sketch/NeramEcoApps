import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/timetable?classroom={id}&start={date}&end={date}
 *
 * Returns scheduled classes for a classroom within a date range.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');

    if (!classroomId || !start || !end) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .select('*, topic:nexus_topics(title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url)')
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ classes: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load timetable';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * Helper: verify the caller is a teacher in the given classroom.
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
    const { classroom_id, title, scheduled_date, start_time, end_time, topic_id, create_teams_meeting } = body;

    if (!classroom_id || !title || !scheduled_date || !start_time || !end_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const teacherId = await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    const insertData: any = {
      classroom_id,
      title,
      scheduled_date,
      start_time,
      end_time,
      teacher_id: teacherId,
      topic_id: topic_id || null,
      status: 'scheduled',
    };

    // If create_teams_meeting is requested, the client should call /api/graph/teams
    // separately and then update the class with the meeting URL.
    if (create_teams_meeting) {
      insertData.teams_meeting_url = null; // placeholder — set after Teams API call
    }

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .insert(insertData)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ class: data }, { status: 201 });
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
    const allowedFields = ['title', 'scheduled_date', 'start_time', 'end_time', 'topic_id', 'status', 'teams_meeting_url'];
    const safeUpdates: any = {};
    for (const key of allowedFields) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .update(safeUpdates)
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .select('*')
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
 * DELETE /api/timetable — Cancel a scheduled class (teacher only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id, classroom_id } = await request.json();

    if (!id || !classroom_id) {
      return NextResponse.json({ error: 'Missing id and classroom_id' }, { status: 400 });
    }

    await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    // Soft-delete: set status to cancelled
    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ class: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel class';
    const status = message.includes('Only teachers') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
