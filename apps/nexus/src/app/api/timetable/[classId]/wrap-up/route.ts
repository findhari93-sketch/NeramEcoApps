import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canRunSession, isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';
import { applyWrapUp } from '@/lib/class-wrapup-write';
import { refreshClassAnnouncement } from '@/lib/teams-class-announcements';
import { classShareLinks, shareBaseUrl } from '@/lib/class-share-links';

/**
 * Wrap up a class after it has happened.
 *
 * The topic is often not known in advance: a class gets scheduled as "Class by
 * Ar Hari Babu" and only afterwards is it clear that it covered perspective
 * basics, that it was Aptitude rather than Mathematics, and roughly what was
 * taken. Until now none of that could be recorded from the timetable, so the
 * calendar filled with untitled classes nobody could search later.
 *
 * Everything here writes to columns that already exist. The one new thing is
 * tags, which reuse the question bank's registry (nexus_qb_tags) rather than a
 * second vocabulary, so a class and a question can be "Aptitude" in the same
 * sense and the recordings list can be filtered by it.
 *
 * Recording links go through the shared validator in lib/class-links, the same
 * one the Class Day screen uses.
 */

interface Ctx {
  params: { classId: string };
}

const CLASS_COLS =
  'id, classroom_id, teacher_id, title, description, notes, summary_bullets, scheduled_date, start_time, end_time, topic_id, plan_entry_id, recording_url, youtube_url, meeting_group_id, content_edited_at, content_edited_by';

async function resolveAccess(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select(CLASS_COLS)
    .eq('id', classId)
    .single();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', cls.classroom_id)
    .eq('is_active', true)
    .maybeSingle();

  // Internal staff reach any classroom without being enrolled in it; that is
  // the point of the tier. Everyone else must hold an active enrollment.
  const internal = isInternalStaff(resolveStaffRole(user));
  if (!enrollment && !internal) {
    return { error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) };
  }

  // Internal staff may act on any class; an external teacher only on the
  // classes they are the tutor of. See canRunSession.
  const canEdit = canRunSession(user, cls.teacher_id);
  return { userId: user.id as string, canEdit, cls };
}

/** The tags currently on a class. */
async function loadTags(supabase: any, classId: string) {
  const { data } = await supabase
    .from('nexus_class_tags')
    .select('tag_id, tag:nexus_qb_tags(id, slug, label, group_type, color)')
    .eq('scheduled_class_id', classId);
  return (data || []).map((r: any) => r.tag).filter(Boolean);
}

/**
 * GET /api/timetable/[classId]/wrap-up
 *
 * What the class currently says about itself, plus the tag vocabulary to pick
 * from. Only subject and theme tags are offered: the exam group describes a
 * paper, not a lesson.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    const [tags, availableTags, topics, backup] = await Promise.all([
      loadTags(supabase, params.classId),
      access.canEdit
        ? supabase
            .from('nexus_qb_tags')
            .select('id, slug, label, group_type, color')
            .in('group_type', ['subject', 'theme'])
            .eq('is_active', true)
            .order('group_type', { ascending: true })
            .order('sort_order', { ascending: true })
            .then((r: any) => r.data || [])
        : Promise.resolve([]),
      access.canEdit
        ? supabase
            .from('nexus_topics')
            .select('id, title, category')
            .eq('classroom_id', access.cls.classroom_id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .then((r: any) => r.data || [])
        : Promise.resolve([]),
      // The automatic backup's state, so the panel can say where the recording is
      // rather than showing an empty YouTube box for three days. Staff only: a
      // student has no use for an upload's byte count.
      access.canEdit
        ? supabase
            .from('nexus_class_video_uploads')
            .select('status, attempts, detail, bytes_uploaded, file_size, youtube_video_id, privacy_status, uploaded_at')
            .eq('class_id', params.classId)
            .maybeSingle()
            .then((r: any) => r.data || null)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      class: access.cls,
      tags,
      availableTags,
      topics,
      canEdit: access.canEdit,
      backup,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the class';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/timetable/[classId]/wrap-up  (staff)
 *
 * Body, all optional: { title, description, topic_id, tag_ids,
 *                       recording_url, youtube_url }
 *
 * Partial by design. A teacher who only pastes the YouTube link a week later
 * should not have to restate the title and tags to do it.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can wrap up a class' }, { status: 403 });
    }

    // Columns, the content lock, the sibling row, tags and the Library mirror all
    // live in lib/class-wrapup-write, because the nightly autodraft writes exactly
    // the same thing and a second copy of the lock logic would lose titles.
    const saved = await applyWrapUp(supabase, access.cls, body, access.userId);
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: saved.status ?? 400 });
    }
    if (saved.tagWarning) {
      return NextResponse.json(
        { error: 'Saved, but one of those tags no longer exists. Pick them again.' },
        { status: 409 },
      );
    }

    // Bring the Teams channel card up to date, so the group stops reading the
    // topic we planned and starts reading the one we taught.
    //
    // Only when the account itself moved: pasting a recording link a week later is
    // not news, and this costs Graph round trips. The Teams CALENDAR meeting is
    // never touched here, see refreshClassAnnouncement for why.
    //
    // Only this class, not its meeting_group_id siblings: a sibling lives in a
    // different classroom with its own team and its own card, and the join card to
    // reply under generally exists on one of them only. Their Nexus rows are
    // already correct via the propagation inside applyWrapUp.
    const topicMoved = saved.topicMoved;

    const graphToken = extractBearerToken(request.headers.get('Authorization'));
    // Impersonation, parent and E2E tokens are Nexus's own, not Microsoft's.
    // Sending one to Graph just earns a 401 and a confusing log line.
    const isGraphToken = !!graphToken && !/^(test_|imp_|par_)/.test(graphToken);

    if (topicMoved && isGraphToken) {
      try {
        await refreshClassAnnouncement(
          graphToken!,
          supabase,
          params.classId,
          classShareLinks(shareBaseUrl(request.nextUrl.origin)).classInTimetable(params.classId),
        );
      } catch (teamsErr) {
        console.error('Teams wrap-up card refresh failed (non-blocking):', teamsErr);
      }
    }

    const { data: updated } = await supabase
      .from('nexus_scheduled_classes')
      .select(CLASS_COLS)
      .eq('id', params.classId)
      .single();

    return NextResponse.json({
      class: updated,
      tags: await loadTags(supabase, params.classId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save the class';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
