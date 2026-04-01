import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyClassCreated, notifyClassCancelled } from '@/lib/timetable-notifications';
import { generateRecurrenceDates } from './recurrence';

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

    let allClasses = data || [];

    // Merge Common Classes into every classroom view
    // (skip if the active classroom IS the common classroom)
    const { data: commonClassroom } = await supabase
      .from('nexus_classrooms')
      .select('id')
      .eq('type', 'common')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (commonClassroom && commonClassroom.id !== classroomId) {
      // Check user is enrolled in common classroom too
      const { data: commonEnrollment } = await supabase
        .from('nexus_enrollments')
        .select('role, batch_id')
        .eq('user_id', user.id)
        .eq('classroom_id', commonClassroom.id)
        .eq('is_active', true)
        .maybeSingle();

      if (commonEnrollment) {
        let commonQuery = supabase
          .from('nexus_scheduled_classes')
          .select(CLASS_SELECT)
          .eq('classroom_id', commonClassroom.id)
          .gte('scheduled_date', start)
          .lte('scheduled_date', end)
          .order('scheduled_date', { ascending: true })
          .order('start_time', { ascending: true });

        if (commonEnrollment.role === 'student') {
          if (commonEnrollment.batch_id) {
            commonQuery = commonQuery.or(`batch_id.is.null,batch_id.eq.${commonEnrollment.batch_id}`);
          } else {
            commonQuery = commonQuery.is('batch_id', null);
          }
        }

        const { data: commonData } = await commonQuery;
        if (commonData && commonData.length > 0) {
          allClasses = [...allClasses, ...commonData].sort((a, b) => {
            const dateCmp = a.scheduled_date.localeCompare(b.scheduled_date);
            if (dateCmp !== 0) return dateCmp;
            return a.start_time.localeCompare(b.start_time);
          });
        }
      }
    }

    return NextResponse.json({ classes: allClasses, role: enrollment.role });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load timetable';
    return NextResponse.json({ error: message }, { status: 500 });
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
    const {
      classroom_id, title, scheduled_date, start_time, end_time,
      topic_id, batch_id, teams_meeting_scope, target_scope, description,
      lobby_bypass, allowed_presenters, recurrence_rule, recurrence_end_date,
    } = body;

    if (!classroom_id || !title || !scheduled_date || !start_time || !end_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const teacherId = await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    const baseData: Record<string, unknown> = {
      classroom_id,
      title,
      start_time,
      end_time,
      teacher_id: teacherId,
      topic_id: topic_id || null,
      batch_id: batch_id || null,
      teams_meeting_scope: teams_meeting_scope || null,
      target_scope: target_scope || (batch_id ? 'batch' : 'classroom'),
      description: description || null,
      lobby_bypass: lobby_bypass || 'organization',
      allowed_presenters: allowed_presenters || 'organizer',
      status: 'scheduled',
    };

    // Handle recurrence: generate multiple dates
    if (recurrence_rule && recurrence_end_date) {
      const dates = generateRecurrenceDates(scheduled_date, recurrence_end_date, recurrence_rule);
      if (dates.length === 0) {
        return NextResponse.json({ error: 'No matching dates found for recurrence rule' }, { status: 400 });
      }
      if (dates.length > 90) {
        return NextResponse.json({ error: 'Recurrence generates too many classes (max 90)' }, { status: 400 });
      }

      const groupId = crypto.randomUUID();
      const rows = dates.map((date) => ({
        ...baseData,
        scheduled_date: date,
        recurrence_rule: recurrence_rule,
        recurrence_group_id: groupId,
      }));

      const { data, error } = await supabase
        .from('nexus_scheduled_classes')
        .insert(rows as any)
        .select(CLASS_SELECT);

      if (error) throw error;

      // Notify for first class only (avoid spam)
      try {
        if (data && data.length > 0) {
          await notifyClassCreated(classroom_id, `${title} (${data.length} classes)`, scheduled_date, data[0].id);
        }
      } catch {
        // Don't fail creation if notification fails
      }

      return NextResponse.json({ classes: data, count: data?.length || 0 }, { status: 201 });
    }

    // Single class insert
    const insertData = { ...baseData, scheduled_date };

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
      'teams_meeting_url', 'teams_meeting_id', 'teams_meeting_join_url', 'teams_meeting_scope',
      'batch_id', 'recording_url', 'transcript_url', 'notes', 'description', 'target_scope',
      'lobby_bypass', 'allowed_presenters',
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
    const token = extractBearerToken(request.headers.get('Authorization'));
    const { id, classroom_id, permanent } = await request.json();

    if (!id || !classroom_id) {
      return NextResponse.json({ error: 'Missing id and classroom_id' }, { status: 400 });
    }

    await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    // Fetch the class first to get Teams meeting info for cancellation
    const { data: classToDelete } = await supabase
      .from('nexus_scheduled_classes')
      .select('teams_meeting_id, teams_meeting_scope')
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .single();

    let teamsWarning: string | undefined;

    if (permanent) {
      // Cancel Teams event before deleting from DB
      if (classToDelete?.teams_meeting_id && token) {
        const result = await cancelTeamsEvent(token, supabase, classroom_id, classToDelete.teams_meeting_id, classToDelete.teams_meeting_scope);
        if (!result.success) teamsWarning = result.error;
      }

      const { error } = await supabase
        .from('nexus_scheduled_classes')
        .delete()
        .eq('id', id)
        .eq('classroom_id', classroom_id);

      if (error) throw error;

      return NextResponse.json({ deleted: true, ...(teamsWarning && { teamsWarning }) });
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

    // Cancel Teams event (best-effort)
    if (classToDelete?.teams_meeting_id && token) {
      const result = await cancelTeamsEvent(token, supabase, classroom_id, classToDelete.teams_meeting_id, classToDelete.teams_meeting_scope);
      if (!result.success) teamsWarning = result.error;
    }

    // Notify students
    try {
      if (data) {
        await notifyClassCancelled(classroom_id, data.title, data.scheduled_date, id);
      }
    } catch {
      // Don't fail cancellation if notification fails
    }

    return NextResponse.json({ class: data, ...(teamsWarning && { teamsWarning }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel class';
    const status = message.includes('Only teachers') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Cancel/delete a Teams meeting event (best-effort, non-blocking).
 *
 * For channel_meeting (group calendar events): DELETE /groups/{teamId}/calendar/events/{eventId}
 *   - Falls back to DELETE /me/onlineMeetings/{meetingId} for legacy records
 * For standalone meetings: DELETE /me/onlineMeetings/{meetingId}
 *
 * Returns { success, error? } so the caller can surface warnings.
 */
async function cancelTeamsEvent(
  token: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  classroomId: string,
  meetingId: string,
  scope: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (scope === 'channel_meeting') {
      // Group calendar event — need teamId
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('ms_team_id')
        .eq('id', classroomId)
        .single();

      if (classroom?.ms_team_id) {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${classroom.ms_team_id}/calendar/events/${meetingId}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          // Fallback for legacy records: meetingId might be a standalone online meeting ID
          // (before the fix, channel_meeting scope stored standalone meeting IDs)
          if (res.status === 404 || res.status === 400) {
            console.warn('Group calendar delete failed, trying standalone meeting fallback...');
            const fallbackRes = await fetch(
              `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
            );
            if (!fallbackRes.ok) {
              const errText = await fallbackRes.text().catch(() => '');
              console.error('Fallback standalone meeting delete also failed:', fallbackRes.status, errText);
              return { success: false, error: `Could not remove meeting from Teams (${fallbackRes.status})` };
            }
          } else {
            const errText = await res.text().catch(() => '');
            console.error('Failed to cancel group calendar event:', res.status, errText);
            return { success: false, error: `Could not remove meeting from Teams (${res.status})` };
          }
        }
      }
    } else {
      // Standalone online meeting or personal calendar event
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Failed to cancel online meeting:', res.status, errText);
        return { success: false, error: `Could not remove meeting from Teams (${res.status})` };
      }
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to cancel Teams event:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error cancelling Teams event' };
  }
}
