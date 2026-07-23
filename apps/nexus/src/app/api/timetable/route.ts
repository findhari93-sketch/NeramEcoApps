import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyClassCreated, notifyClassCancelled } from '@/lib/timetable-notifications';
import { loadPlanShapes } from '@/lib/plan-shape-query';
import { notifyStudents } from '@/lib/notify-students';
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

    // Look up user (need user_type so staff can browse archived past-year classrooms)
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Look up the classroom to know whether it is an archived (past-year, read-only)
    // cohort. Under one-classroom-per-year each classroom is a single cohort, so no
    // cross-classroom "Common" merge is needed anymore.
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('id, is_archived')
      .eq('id', classroomId)
      .single();

    if (!classroom) {
      return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
    }

    const isStaff = user.user_type === 'teacher' || user.user_type === 'admin';

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role, batch_id')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .maybeSingle();

    // Access control:
    //  - Archived classroom: read-only Past Sessions browse for staff only. A teacher
    //    who never taught that cohort may still view it; students are blocked (their
    //    own archived enrollment is already filtered out of /api/auth/me).
    //  - Active classroom: unchanged — the caller must be enrolled.
    if (classroom.is_archived) {
      if (!isStaff) {
        return NextResponse.json({ error: 'This classroom is archived' }, { status: 403 });
      }
    } else if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    // Effective view role: the enrolled role if any, else staff browsing gets the
    // full (teacher) view.
    const effectiveRole = enrollment?.role || 'teacher';

    let query = supabase
      .from('nexus_scheduled_classes')
      .select(CLASS_SELECT)
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });

    // For students: filter by their batch (show classroom-wide + their batch),
    // and hide anything the teacher has not published yet. Staff see drafts so
    // they can plan the week before releasing it.
    if (effectiveRole === 'student') {
      query = query.eq('publish_state', 'published');
      if (enrollment?.batch_id) {
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

    // The course plans covering this range decide the shape of the day: evening
    // only during the regular year, mornings too once the crash course starts.
    // Fetched here so the calendar reshapes itself without a second call, and
    // treated as optional: a failure should narrow the calendar to the global
    // window, never blank the week.
    const planShapes = await loadPlanShapes(supabase, [classroomId], start, end).catch(() => []);

    return NextResponse.json({
      classes: data || [],
      role: effectiveRole,
      archived: !!classroom.is_archived,
      planShapes,
    });
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

  // Archived (past-year) classrooms are read-only — no create/update/delete.
  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('is_archived')
    .eq('id', classroomId)
    .single();

  if (classroom?.is_archived) {
    throw new Error('This classroom is archived and read-only');
  }

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
      publish_state,
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
      // Callers must opt IN to drafting. Everything that existed before the
      // planner (including the Teams sync) keeps publishing immediately.
      publish_state: publish_state === 'draft' ? 'draft' : 'published',
      published_at: publish_state === 'draft' ? null : new Date().toISOString(),
    };
    const isDraft = baseData.publish_state === 'draft';

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

      // Notify for first class only (avoid spam). Drafts stay silent: students
      // hear about them once, at publish.
      try {
        if (!isDraft && data && data.length > 0) {
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

    // Notify students, unless this is a draft the teacher is still planning.
    try {
      if (!isDraft && data) {
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
    const status = message.includes('archived') ? 409 : message.includes('Only teachers') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/timetable — Update a scheduled class (teacher only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'));
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
      'lobby_bypass', 'allowed_presenters', 'auto_sync_recording', 'rescheduled_to',
    ];
    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    // What the class looked like before, so a move can be recognised and
    // described rather than just announced. Untyped: publish_state is newer
    // than the generated Database type, like the other recent Nexus columns.
    const { data: before } = (await (supabase as any)
      .from('nexus_scheduled_classes')
      .select('title, scheduled_date, start_time, end_time, teams_meeting_id, teams_meeting_scope, publish_state')
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .single()) as {
      data: {
        title: string;
        scheduled_date: string;
        start_time: string;
        end_time: string;
        teams_meeting_id: string | null;
        teams_meeting_scope: string | null;
        publish_state: string | null;
      } | null;
    };

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .update(safeUpdates)
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .select(CLASS_SELECT)
      .single();

    if (error) throw error;

    // A class moved in Nexus used to leave its Teams meeting behind, so students
    // saw one time in the app and another in their calendar. Push the change.
    const moved =
      !!before &&
      (('scheduled_date' in safeUpdates && safeUpdates.scheduled_date !== before.scheduled_date) ||
        ('start_time' in safeUpdates && safeUpdates.start_time !== before.start_time) ||
        ('end_time' in safeUpdates && safeUpdates.end_time !== before.end_time));

    let teamsWarning: string | undefined;
    if (moved && before?.teams_meeting_id && token) {
      const result = await updateTeamsEvent(token, supabase, classroom_id, before.teams_meeting_id, before.teams_meeting_scope, {
        date: (safeUpdates.scheduled_date as string) ?? before.scheduled_date,
        start: (safeUpdates.start_time as string) ?? before.start_time,
        end: (safeUpdates.end_time as string) ?? before.end_time,
        title: (safeUpdates.title as string) ?? before.title,
      });
      if (!result.success) teamsWarning = result.error;
    }

    // Tell the students, but only for a class they can already see. Moving a
    // draft around while planning is not news.
    if (moved && before?.publish_state !== 'draft') {
      await notifyStudents({
        classroomId: classroom_id,
        eventType: 'class_rescheduled',
        title: 'Class moved',
        message: `"${(safeUpdates.title as string) ?? before?.title}" has moved to ${formatWhen(
          (safeUpdates.scheduled_date as string) ?? before!.scheduled_date,
          (safeUpdates.start_time as string) ?? before!.start_time,
        )}.`,
        teamsText: 'A class has been moved',
        metadata: { class_id: id },
      }).catch(() => {
        /* the class is already moved; a failed announcement must not undo it */
      });
    }

    return NextResponse.json({ class: data, ...(teamsWarning && { teamsWarning }), moved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update class';
    const status = message.includes('archived') ? 409 : message.includes('Only teachers') ? 403 : 500;
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
    const status = message.includes('archived') ? 409 : message.includes('Only teachers') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** "Wed 22 Jul at 7:00 PM", built in IST so a 9 PM class is not shifted a day. */
function formatWhen(date: string, time: string): string {
  const d = new Date(`${date}T${time}+05:30`);
  if (Number.isNaN(d.getTime())) return `${date} at ${time}`;
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Move a Teams meeting to a new time (best-effort, non-blocking).
 *
 * Mirrors cancelTeamsEvent: a channel meeting is a group calendar event, a
 * standalone one is an online meeting, and the two take different payloads.
 * Failure returns a warning rather than throwing, because the class HAS moved
 * in Nexus by this point and rolling that back over a Graph hiccup would be
 * worse than a calendar entry that needs fixing by hand.
 */
async function updateTeamsEvent(
  token: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  classroomId: string,
  meetingId: string,
  scope: string | null,
  when: { date: string; start: string; end: string; title: string },
): Promise<{ success: boolean; error?: string }> {
  // Graph wants a local time plus a named zone, not an offset.
  const startDateTime = `${when.date}T${when.start.slice(0, 8).padEnd(8, ':00')}`;
  const endDateTime = `${when.date}T${when.end.slice(0, 8).padEnd(8, ':00')}`;
  const TZ = 'India Standard Time';

  try {
    if (scope === 'channel_meeting') {
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('ms_team_id')
        .eq('id', classroomId)
        .single();

      if (!classroom?.ms_team_id) {
        return { success: false, error: 'This classroom has no Team, so the meeting could not be moved' };
      }

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${classroom.ms_team_id}/calendar/events/${meetingId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: when.title,
            start: { dateTime: startDateTime, timeZone: TZ },
            end: { dateTime: endDateTime, timeZone: TZ },
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Failed to move group calendar event:', res.status, errText);
        return { success: false, error: `The class moved here, but Teams still shows the old time (${res.status})` };
      }
      return { success: true };
    }

    // Standalone online meeting: ISO instants, no timezone object.
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: when.title,
        startDateTime: new Date(`${when.date}T${when.start}+05:30`).toISOString(),
        endDateTime: new Date(`${when.date}T${when.end}+05:30`).toISOString(),
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Failed to move online meeting:', res.status, errText);
      return { success: false, error: `The class moved here, but Teams still shows the old time (${res.status})` };
    }
    return { success: true };
  } catch (err) {
    console.error('Error moving Teams meeting:', err);
    return { success: false, error: 'The class moved here, but Teams could not be updated' };
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
