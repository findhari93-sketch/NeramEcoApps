import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyClassCreated, notifyClassCancelled } from '@/lib/timetable-notifications';
import { loadPlanShapes } from '@/lib/plan-shape-query';
import { applyClassPrepGate } from '@/lib/class-prep-server';
import { notifyStudents } from '@/lib/notify-students';
import { generateRecurrenceDates } from './recurrence';
import {
  announceCancellationToTeams,
  announceRescheduleToTeams,
  removeTeamsAnnouncements,
  cancelTeamsEvent,
} from '@/lib/teams-class-announcements';
import { classifyMeetingArtifacts } from '@/lib/teams-online-meeting';
import { assertCanTutor } from '@/lib/staff-scope';
import {
  canTutor,
  canUser,
  isInternalStaff as isInternalStaffRole,
  resolveStaffRole,
} from '@/lib/staff-capabilities';
import { ApiError } from '@/lib/api-errors';
import { classStartIso } from '@/lib/prework';
import { CLASS_IMAGES_EMBED } from '@/lib/class-cover';

const CLASS_SELECT = `*, topic:nexus_topics(id, title, category), course_topic:nexus_course_topics(id, title), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url), batch:nexus_batches!nexus_scheduled_classes_batch_id_fkey(id, name)`;

/**
 * The week/month read, which also needs each class's images so the planner can
 * show a cover in front of every finished class.
 *
 * A SEPARATE constant from CLASS_SELECT on purpose: that one is also the
 * `.select()` on the POST and PATCH below, where a gallery join would be pure
 * waste on every class create and every class edit.
 *
 * Reference material rides along as a COUNT, never as rows. This is the most
 * requested response in the app, so a card gets enough to say "there is material
 * here" and the list itself is fetched only when a class is actually opened.
 */
const CLASS_SELECT_WITH_IMAGES = `${CLASS_SELECT}, ${CLASS_IMAGES_EMBED}, class_resources:nexus_class_resources(count)`;

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

    // Look up user (need the staff tier so staff can browse archived past-year
    // classrooms, and so an external teacher's view can be session-scoped below)
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
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

    const isStaff = resolveStaffRole(user) !== null;

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
      .select(CLASS_SELECT_WITH_IMAGES)
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
      // No tutor scoping here, deliberately. This route once narrowed a
      // non-internal teacher to `teacher_id = their own id`, which quietly hid
      // two whole populations: classes tutored by a colleague, and the ~half of
      // all rows that carry no teacher_id at all (everything imported by the
      // Teams backfill and the older meeting sync). The result was a teacher
      // opening the timetable to a completely empty month.
      //
      // The classroom timetable is shared context: every member of the
      // classroom, students included, sees the same schedule. Tutor identity is
      // shown on the class, not used to filter it. Calendar scoping, which is
      // what staff tiers were actually introduced for, lives in the Teams
      // meeting code, not here. See @/lib/staff-scope.
    }

    const { data, error } = await query;
    if (error) throw error;

    // The course plans covering this range decide the shape of the day: evening
    // only during the regular year, mornings too once the crash course starts.
    // Fetched here so the calendar reshapes itself without a second call, and
    // treated as optional: a failure should narrow the calendar to the global
    // window, never blank the week.
    const planShapes = await loadPlanShapes(supabase, [classroomId], start, end).catch(() => []);

    // The class prep gate. effectiveRole is already resolved above, and this
    // route is single-classroom, so the role map has exactly one entry.
    const prep = await applyClassPrepGate(supabase as any, user.id, (data || []) as any, {
      roleByClassroom: new Map([[classroomId, effectiveRole]]),
      impersonating: !!msUser.impersonatorUserId,
    });

    return NextResponse.json({
      classes: data || [],
      role: effectiveRole,
      archived: !!classroom.is_archived,
      planShapes,
      prep,
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
    .select('id, user_type, staff_role, can_teach')
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

  // Building the schedule is internal-team work (teach.timetable.schedule), so an
  // external teacher cannot create, move or cancel classes. They still RUN the
  // classes assigned to them: wrap-up, attendance, recap and grading are gated on
  // teach.session.run plus assertSessionAccess, not on this helper.
  if (!canUser(user, 'teach.timetable.schedule')) {
    throw new ApiError(
      'Only the Neram team can change the timetable. Ask them to schedule or move this class.',
      403,
    );
  }

  // Internal staff schedule across every cohort. Anyone else holding the
  // capability must still hold a teacher enrollment in this specific classroom.
  if (!isInternalStaffRole(resolveStaffRole(user))) {
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      throw new ApiError('You are not a teacher in this classroom.', 403);
    }
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
      classroom_id, classroom_ids, title, scheduled_date, start_time, end_time,
      topic_id, course_topic_id, batch_id, teams_meeting_scope, target_scope, description,
      lobby_bypass, allowed_presenters, recurrence_rule, recurrence_end_date,
      publish_state, teacher_id: tutorIdInput,
    } = body;

    // Multi-classroom: one logical class can target several classrooms. Each classroom
    // still gets its own row (visibility is enrollment-based, no class<->classrooms join);
    // sibling rows share a meeting_group_id so they read as one meeting. `classroom_ids`
    // is the new field; `classroom_id` is kept for backward compatibility.
    const classroomIds: string[] = Array.from(
      new Set(
        (Array.isArray(classroom_ids) && classroom_ids.length > 0
          ? classroom_ids
          : classroom_id
            ? [classroom_id]
            : []
        ).filter(Boolean),
      ),
    );

    if (classroomIds.length === 0 || !title || !scheduled_date || !start_time || !end_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify the teacher can manage every selected classroom (also blocks archived ones).
    // The teacher id is the same user across classrooms.
    let teacherId: string | null = null;
    for (const cid of classroomIds) {
      teacherId = await verifyTeacherRole(msUser.oid, cid);
    }

    // The tutor who takes the class.
    //
    // Eligibility is can_teach, not the authority tier: an office manager holds
    // every other manager power but never takes a class. An ineligible pick is
    // REJECTED rather than silently swapped for the scheduler, because silently
    // reassigning the class to someone else is how a class ends up on the wrong
    // person's calendar with nobody noticing.
    //
    // `teacherId` (the scheduler) remains the authorization check above.
    let tutorId: string | null = null;
    if (tutorIdInput) {
      await assertCanTutor(tutorIdInput);
      tutorId = tutorIdInput;
    } else if (teacherId) {
      // No explicit pick: default to the scheduler, but only if they can teach.
      // Without this, a non-teaching manager scheduling a class would silently
      // become its tutor.
      const { data: scheduler } = await supabase
        .from('users')
        .select('id, user_type, staff_role, can_teach')
        .eq('id', teacherId)
        .maybeSingle();
      if (!canTutor(scheduler)) {
        return NextResponse.json(
          { error: 'Choose who is taking this class. Your account is not set up to take classes.' },
          { status: 400 },
        );
      }
      tutorId = teacherId;
    }

    // Classroom types drive the display-only target_scope ('all' for the common cohort).
    const { data: classroomRows } = await supabase
      .from('nexus_classrooms')
      .select('id, type')
      .in('id', classroomIds);
    const typeById = new Map<string, string>((classroomRows || []).map((c) => [c.id, c.type]));

    const isDraftReq = publish_state === 'draft';
    const publishedAt = isDraftReq ? null : new Date().toISOString();

    // One shared meeting group when the class spans multiple classrooms.
    const meetingGroupId = classroomIds.length > 1 ? crypto.randomUUID() : null;

    const baseFor = (cid: string): Record<string, unknown> => ({
      classroom_id: cid,
      title,
      start_time,
      end_time,
      teacher_id: tutorId || teacherId,
      // Topics now come from the Course Plan Builder (course_topic_id). topic_id is the
      // legacy topic space, kept null unless a caller still sends it.
      course_topic_id: course_topic_id || null,
      topic_id: topic_id || null,
      batch_id: batch_id || null,
      // Only touch meeting_group_id when this class actually spans classrooms, so
      // single-classroom creates keep working before the column migration is applied.
      ...(meetingGroupId ? { meeting_group_id: meetingGroupId } : {}),
      teams_meeting_scope: teams_meeting_scope || null,
      target_scope: target_scope || (typeById.get(cid) === 'common' ? 'all' : 'classroom'),
      description: description || null,
      lobby_bypass: lobby_bypass || 'organization',
      allowed_presenters: allowed_presenters || 'organizer',
      status: 'scheduled',
      // Callers must opt IN to drafting. Everything that existed before the
      // planner (including the Teams sync) keeps publishing immediately.
      publish_state: isDraftReq ? 'draft' : 'published',
      published_at: publishedAt,
    });

    // Dates: recurrence expands to many, otherwise a single date.
    let dates: string[] = [scheduled_date];
    const recurrenceGroupId = recurrence_rule && recurrence_end_date ? crypto.randomUUID() : null;
    if (recurrence_rule && recurrence_end_date) {
      dates = generateRecurrenceDates(scheduled_date, recurrence_end_date, recurrence_rule);
      if (dates.length === 0) {
        return NextResponse.json({ error: 'No matching dates found for recurrence rule' }, { status: 400 });
      }
      if (dates.length > 90) {
        return NextResponse.json({ error: 'Recurrence generates too many classes (max 90)' }, { status: 400 });
      }
    }

    // One row per (classroom × date).
    const rows = classroomIds.flatMap((cid) =>
      dates.map((date) => ({
        ...baseFor(cid),
        scheduled_date: date,
        ...(recurrenceGroupId
          ? { recurrence_rule, recurrence_group_id: recurrenceGroupId }
          : {}),
      })),
    );

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .insert(rows as any)
      .select(CLASS_SELECT);

    if (error) throw error;

    // Notify students per classroom (students are enrolled per classroom). Send once
    // per classroom for the first date only; drafts stay silent until publish.
    try {
      if (!isDraftReq && data && data.length > 0) {
        const label = dates.length > 1 ? `${title} (${dates.length} classes)` : title;
        for (const cid of classroomIds) {
          const first = data.find((c) => c.classroom_id === cid);
          if (first) await notifyClassCreated(cid, label, scheduled_date, first.id);
        }
      }
    } catch {
      // Don't fail creation if notification fails
    }

    // Return `classes` (always) plus `class` for the simple single-row case so older
    // callers keep working.
    return NextResponse.json(
      {
        classes: data,
        count: data?.length || 0,
        meeting_group_id: meetingGroupId,
        ...(data && data.length === 1 ? { class: data[0] } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create class';
    // ApiError already carries its intended status (e.g. an ineligible tutor is a
    // 400, not a server fault), so honour it before the message heuristics.
    const status =
      err instanceof ApiError
        ? err.status
        : message.includes('archived')
          ? 409
          : message.includes('Only teachers')
            ? 403
            : 500;
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

    const editorUserId = await verifyTeacherRole(msUser.oid, classroom_id);
    const supabase = getSupabaseAdminClient();

    // Only allow updating specific fields
    const allowedFields = [
      'title', 'scheduled_date', 'start_time', 'end_time', 'topic_id', 'course_topic_id', 'status', 'teacher_id',
      'teams_meeting_url', 'teams_meeting_id', 'teams_meeting_join_url', 'teams_meeting_scope',
      'batch_id', 'recording_url', 'transcript_url', 'notes', 'description', 'target_scope',
      'lobby_bypass', 'allowed_presenters', 'auto_sync_recording', 'rescheduled_to',
    ];
    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    // Reassigning the tutor goes through the same eligibility gate as creation,
    // so a non-teaching staff member cannot be made tutor by editing a class
    // that already exists. Clearing it (null) is allowed.
    if (safeUpdates.teacher_id) {
      await assertCanTutor(String(safeUpdates.teacher_id));
    }

    // What the class looked like before, so a move can be recognised and
    // described rather than just announced. Untyped: publish_state is newer
    // than the generated Database type, like the other recent Nexus columns.
    const { data: before } = (await (supabase as any)
      .from('nexus_scheduled_classes')
      .select(
        'title, description, notes, scheduled_date, start_time, end_time, teams_meeting_id, teams_meeting_scope, teams_calendar_event_id, teams_meeting_join_url, teams_meeting_url, teams_channel_id, teams_channel_message_id, teams_group_chat_message_id, publish_state',
      )
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .single()) as {
      data: {
        title: string;
        description: string | null;
        notes: string | null;
        scheduled_date: string;
        start_time: string;
        end_time: string;
        teams_meeting_id: string | null;
        teams_meeting_scope: string | null;
        teams_calendar_event_id: string | null;
        teams_meeting_join_url: string | null;
        teams_meeting_url: string | null;
        teams_channel_id: string | null;
        teams_channel_message_id: string | null;
        teams_group_chat_message_id: string | null;
        publish_state: string | null;
      } | null;
    };

    // A class moved in Nexus used to leave its Teams meeting behind, so students
    // saw one time in the app and another in their calendar.
    const moved =
      !!before &&
      (('scheduled_date' in safeUpdates && safeUpdates.scheduled_date !== before.scheduled_date) ||
        ('start_time' in safeUpdates && safeUpdates.start_time !== before.start_time) ||
        ('end_time' in safeUpdates && safeUpdates.end_time !== before.end_time));

    // Renaming a class here is as much a human account of it as the Wrap Up panel,
    // so it takes ownership of the title away from the Teams meeting subject.
    //
    // Compared by VALUE, not by presence: ClassCreateDialog always sends title and
    // description, so a presence check would lock every class the moment anyone
    // opened Edit and pressed Save without changing anything, and a class locked at
    // its Teams subject would then never follow a genuine rename in Outlook.
    const CONTENT_KEYS = ['title', 'description', 'notes'] as const;
    const contentEdited =
      !!before &&
      CONTENT_KEYS.some(
        (k) =>
          k in safeUpdates &&
          (safeUpdates[k] ?? null) !== ((before as unknown as Record<string, unknown>)[k] ?? null),
      );
    if (contentEdited) {
      safeUpdates.content_edited_at = new Date().toISOString();
      safeUpdates.content_edited_by = editorUserId;
    }

    const when = before && {
      date: (safeUpdates.scheduled_date as string) ?? before.scheduled_date,
      start: (safeUpdates.start_time as string) ?? before.start_time,
      end: (safeUpdates.end_time as string) ?? before.end_time,
      title: (safeUpdates.title as string) ?? before.title,
    };

    // Teams FIRST, then the database. This order is load-bearing.
    //
    // The old order wrote the move locally and treated a Graph failure as a
    // warning. But syncClassroomMeetings treats Teams as the source of truth and
    // runs every few minutes, so it read the unmoved event and rewrote the date
    // straight back: the teacher saw "Class updated", and ten minutes later the
    // class was on its old day again with nothing to explain it. Refusing to
    // move locally when Teams refused leaves the two in agreement, which is the
    // only state the reconciler cannot damage.
    if (moved && before?.teams_meeting_id && token && when) {
      const result = await updateTeamsEvent(token, supabase, classroom_id, before, when);
      if (!result.success) {
        return NextResponse.json(
          {
            error:
              result.error ||
              'Microsoft would not move the Teams meeting, so the class was left where it was. Try again in a moment.',
          },
          { status: 502 },
        );
      }
    }

    // Untyped: content_edited_at/by are newer than the generated Database type,
    // like publish_state above.
    const { data, error } = await (supabase as any)
      .from('nexus_scheduled_classes')
      .update(safeUpdates)
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .select(CLASS_SELECT)
      .single();

    if (error) throw error;

    // Pre-class work is due when its class starts, so a class that moves takes
    // its prework deadline with it. Homework is deliberately left alone: its
    // date was set relative to the NEXT class, not this one.
    if (moved && when) {
      await (supabase as any)
        .from('nexus_class_assignments')
        .update({ due_at: classStartIso(when.date, when.start) })
        .eq('scheduled_class_id', id)
        .eq('timing', 'prework');
    }

    // The posted "Join Meeting" cards still advertise the old day. Graph cannot
    // edit a message in place, so replace them the same way a cancellation does.
    if (moved && token && before && when && before.publish_state !== 'draft') {
      try {
        const base = process.env.NEXT_PUBLIC_NEXUS_URL || request.nextUrl.origin;
        const reposted = await announceRescheduleToTeams(
          token,
          supabase,
          classroom_id,
          {
            teams_channel_id: before.teams_channel_id,
            teams_channel_message_id: before.teams_channel_message_id,
            teams_group_chat_message_id: before.teams_group_chat_message_id,
          },
          { title: when.title, scheduled_date: when.date, start_time: when.start, end_time: when.end },
          { scheduled_date: before.scheduled_date, start_time: before.start_time },
          {
            joinUrl: before.teams_meeting_join_url || before.teams_meeting_url,
            rsvpUrl: `${base.replace(/\/$/, '')}/student/rsvp/${id}`,
          },
        );
        if (reposted) {
          await (supabase as any)
            .from('nexus_scheduled_classes')
            .update({
              teams_channel_message_id: reposted.channelMessageId,
              teams_group_chat_message_id: reposted.chatMessageId,
            })
            .eq('id', id);
        }
      } catch (err) {
        // The class has moved and Teams agrees; a stale card is not worth failing on.
        console.error('Reschedule repost failed (non-blocking):', err);
      }
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

    return NextResponse.json({ class: data, moved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update class';
    const status =
      err instanceof ApiError
        ? err.status
        : message.includes('archived')
          ? 409
          : message.includes('Only teachers')
            ? 403
            : 500;
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

    // Fetch the class first to get Teams meeting + announcement info for cleanup.
    // The channel/chat message-ID columns are newer than the generated Database
    // type, so read through an untyped client like the other recent columns.
    const { data: classToDelete } = (await (supabase as any)
      .from('nexus_scheduled_classes')
      .select(
        'teams_meeting_id, teams_meeting_scope, teams_meeting_join_url, teams_meeting_url, teams_calendar_event_id, teams_channel_id, teams_channel_message_id, teams_group_chat_message_id',
      )
      .eq('id', id)
      .eq('classroom_id', classroom_id)
      .single()) as {
      data: {
        teams_meeting_id: string | null;
        teams_meeting_scope: string | null;
        teams_meeting_join_url: string | null;
        teams_meeting_url: string | null;
        teams_calendar_event_id: string | null;
        teams_channel_id: string | null;
        teams_channel_message_id: string | null;
        teams_group_chat_message_id: string | null;
      } | null;
    };

    let teamsWarning: string | undefined;

    if (permanent) {
      // Cancel Teams event before deleting from DB
      if (classToDelete?.teams_meeting_id && token) {
        const result = await cancelTeamsEvent(token, supabase, classroom_id, classToDelete);
        if (!result.success) teamsWarning = result.error;
      }

      // Remove the channel/chat announcement cards too, so a deleted class does
      // not leave a dead "Join Meeting" post behind (best-effort).
      if (token) {
        await removeTeamsAnnouncements(token, supabase, classroom_id, classToDelete);
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
      const result = await cancelTeamsEvent(token, supabase, classroom_id, classToDelete);
      if (!result.success) teamsWarning = result.error;
    }

    // Replace the announcement cards with a cancellation notice, so the group
    // sees the class is off instead of a stale "Join Meeting" card. Graph cannot
    // edit a message in place (only policyViolation is patchable), so we soft-
    // delete the old card and post a fresh "Cancelled" one to the same targets.
    // Best-effort: a Graph hiccup must not undo the cancellation.
    if (token && data) {
      const reposted = await announceCancellationToTeams(token, supabase, classroom_id, classToDelete, {
        title: data.title,
        scheduled_date: data.scheduled_date,
        start_time: data.start_time,
        end_time: data.end_time,
      });
      // Point the stored message IDs at the new "Cancelled" card so a later
      // permanent delete removes the notice too (and we do not try to re-delete
      // the original card, which is already gone).
      if (reposted) {
        await (supabase as any)
          .from('nexus_scheduled_classes')
          .update({
            teams_channel_message_id: reposted.channelMessageId,
            teams_group_chat_message_id: reposted.chatMessageId,
          })
          .eq('id', id)
          .eq('classroom_id', classroom_id);
      }
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
 *
 * The caller treats a failure here as fatal to the move and leaves the class
 * where it was. That is deliberate: the Teams reconciler copies times from Teams
 * back into Nexus, so a class that moved locally while Teams did not is a class
 * that silently springs back to its old day a few minutes later.
 *
 * A standalone meeting can have TWO objects to move: the online meeting, which
 * owns the join link, and the calendar event, which is what actually sits in the
 * tutor's and the students' calendars. Patching only the first is what let a
 * class change time in Nexus while everyone's calendar kept the old slot.
 */
async function updateTeamsEvent(
  token: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  classroomId: string,
  refs: {
    teams_meeting_id: string | null;
    teams_meeting_join_url: string | null;
    teams_meeting_url: string | null;
    teams_calendar_event_id: string | null;
  },
  when: { date: string; start: string; end: string; title: string },
): Promise<{ success: boolean; error?: string }> {
  // Graph wants a local time plus a named zone, not an offset.
  const startDateTime = `${when.date}T${when.start.slice(0, 8).padEnd(8, ':00')}`;
  const endDateTime = `${when.date}T${when.end.slice(0, 8).padEnd(8, ':00')}`;
  const TZ = 'India Standard Time';

  const meetingId = refs.teams_meeting_id;
  if (!meetingId) return { success: true };
  const joinUrl = refs.teams_meeting_join_url || refs.teams_meeting_url || null;
  const calendarEventId = refs.teams_calendar_event_id;

  /**
   * Move the Outlook event that carries the invitations.
   *
   * This is the part everyone actually sees. Moving the meeting alone changes the
   * join link's schedule and leaves every invitee looking at the original slot,
   * which is worse than not moving at all, so a failure here fails the whole move.
   * Skipped when the event id IS the meeting id, which is how the group-calendar
   * path stores it: there is only one artifact and it has already been patched.
   */
  const moveCalendarEvent = async (): Promise<{ success: boolean; error?: string }> => {
    if (!calendarEventId || calendarEventId === meetingId) return { success: true };
    const eventRes = await fetch(`https://graph.microsoft.com/v1.0/me/events/${calendarEventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: when.title,
        start: { dateTime: startDateTime, timeZone: TZ },
        end: { dateTime: endDateTime, timeZone: TZ },
      }),
    });
    if (!eventRes.ok) {
      const errText = await eventRes.text().catch(() => '');
      console.error('Failed to move personal calendar event:', eventRes.status, errText);
      return {
        success: false,
        error: `The Teams meeting moved but the calendar invite did not (${eventRes.status}), so the class was left where it was`,
      };
    }
    return { success: true };
  };

  try {
    // Classified from the ids, not from teams_meeting_scope. See the comment on
    // classifyMeetingArtifacts: the scope column records what was asked for, and
    // that has never matched what Graph actually created.
    if (classifyMeetingArtifacts({ teamsMeetingId: meetingId, joinUrl }) === 'group_event') {
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
        return {
          success: false,
          error:
            res.status === 403
              ? 'Microsoft would not let us move the meeting on the class team calendar, so the class was left where it was. Sign out of Nexus and sign back in, then try again.'
              : `Teams would not move the meeting (${res.status}), so the class was left where it was`,
        };
      }
      // A repaired class can have a separate invite in the teacher's own mailbox
      // alongside the group event, and it has to move too.
      return moveCalendarEvent();
    }

    // Channel meeting or standalone meeting: ISO instants, no timezone object.
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
      return { success: false, error: `Teams would not move the meeting (${res.status}), so the class was left where it was` };
    }

    return moveCalendarEvent();
  } catch (err) {
    console.error('Error moving Teams meeting:', err);
    return { success: false, error: 'The class moved here, but Teams could not be updated' };
  }
}
