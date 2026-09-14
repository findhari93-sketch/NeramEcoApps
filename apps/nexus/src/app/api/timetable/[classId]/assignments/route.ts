import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canRunSession, isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';
import { announceAssignment, shouldAnnounceLink } from '@/lib/teams-assignment-announcements';
import { buildClassLinkUpdate, normalizeTiming, istTodayStr } from '@/lib/assignment-class-link';
import { shareBaseUrl } from '@/lib/class-share-links';

/**
 * The assignments attached to one timetable class.
 *
 * Before this, assignments carried only a loose `class_date`, so a teacher
 * standing in the timetable could not attach one and a student opening a class
 * could not see what it asked of them. `scheduled_class_id` makes that a real
 * relationship; these endpoints read and edit it.
 *
 * One class has many assignments; one assignment belongs to at most one class.
 */

interface Ctx {
  params: { classId: string };
}

const ASSIGNMENT_COLS =
  'id, title, assignment_type, status, due_at, class_date, max_marks, evaluation_type, scheduled_class_id, timing';

/**
 * ASSIGNMENT_COLS plus what an announcement needs: the brief for the card, the
 * classroom to fan out to, and teams_announced_class_id, the marker that stops
 * an unlink-then-relink from posting the same card twice.
 */
const ASSIGNMENT_COLS_WITH_ANNOUNCE =
  `${ASSIGNMENT_COLS}, classroom_id, instructions, teams_announced_class_id`;

/**
 * Resolve the caller and confirm they can see this class.
 *
 * `canEdit` is deliberately not "the enrollment says teacher". An admin is staff
 * everywhere, including classrooms they were never enrolled in, and gating on
 * the enrollment alone silently handed admins an empty `linkable` list and a 403
 * on every link. Staffness is a property of the user; the enrollment only
 * decides whether they can see this classroom at all.
 */
async function resolveAccess(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, teacher_id, scheduled_date, start_time')
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

/**
 * GET /api/timetable/[classId]/assignments
 *
 * Staff also get `linkable`: published or draft assignments in the same
 * classroom that are not yet attached to any class, which is what the "Link
 * existing" picker offers.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    const { data: linked, error } = await supabase
      .from('nexus_class_assignments')
      .select(ASSIGNMENT_COLS)
      .eq('scheduled_class_id', params.classId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Students only ever see published work.
    const visible = access.canEdit
      ? linked || []
      : (linked || []).filter((a: any) => a.status === 'published');

    if (!access.canEdit) {
      return NextResponse.json({ assignments: visible, canEdit: false });
    }

    const { data: linkable } = await supabase
      .from('nexus_class_assignments')
      .select(ASSIGNMENT_COLS)
      .eq('classroom_id', access.cls.classroom_id)
      .is('scheduled_class_id', null)
      .order('class_date', { ascending: false })
      .limit(50);

    return NextResponse.json({ assignments: visible, linkable: linkable || [], canEdit: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load assignments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/[classId]/assignments  (teacher)
 * Body: { assignment_id, timing? }  — attach an existing assignment to this class.
 *
 * `timing: 'prework'` means the student is meant to finish it BEFORE the class,
 * in which case the deadline is derived from the class start rather than typed,
 * so the two can never contradict each other.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { assignment_id } = body;
    const timing = normalizeTiming(body.timing);

    if (!assignment_id) {
      return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can link assignments' }, { status: 403 });
    }

    // The clamp on class_date and the derived prework deadline both live in
    // assignment-class-link, because the assignment form writes this same
    // relationship and the two must not drift. See that file for why.
    const update = buildClassLinkUpdate(
      {
        id: params.classId,
        scheduled_date: access.cls.scheduled_date,
        start_time: access.cls.start_time,
      },
      timing,
      istTodayStr(),
    );

    // Scope the update to the same classroom so a valid-looking id from another
    // cohort cannot be pulled in.
    const { data, error } = await supabase
      .from('nexus_class_assignments')
      .update(update)
      .eq('id', assignment_id)
      .eq('classroom_id', access.cls.classroom_id)
      .select(ASSIGNMENT_COLS_WITH_ANNOUNCE)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: 'That assignment does not belong to this classroom' },
        { status: 404 },
      );
    }

    // Tell students the assignment now belongs to a class, but only when there
    // is actually news to tell. See shouldAnnounceLink for which cases are
    // deliberately silent, the timetable "Create new" path chief among them.
    if (shouldAnnounceLink(data, params.classId)) {
      announceAssignment({
        assignment: {
          id: data.id,
          classroom_id: data.classroom_id,
          scheduled_class_id: params.classId,
          title: data.title,
          assignment_type: data.assignment_type === 'drawing' ? 'drawing' : 'document',
          due_at: data.due_at,
          evaluation_type: data.evaluation_type === 'stars' ? 'stars' : 'marks',
          max_marks: data.max_marks ?? null,
          instructions: data.instructions ?? null,
        },
        kind: 'linked',
        token: extractBearerToken(request.headers.get('Authorization')),
        actorUserId: access.userId,
        shareBase: shareBaseUrl(request.nextUrl.origin),
        supabase,
      }).catch((e) => console.error('announceAssignment (link) failed:', e));
    }

    return NextResponse.json({ assignment: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link the assignment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/timetable/[classId]/assignments  (teacher)
 * Body: { assignment_id }  — detach, without deleting the assignment itself.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { assignment_id } = await request.json();

    if (!assignment_id) {
      return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can unlink assignments' }, { status: 403 });
    }

    // Unlinking never deletes: submissions and marks stay with the assignment.
    const { error } = await supabase
      .from('nexus_class_assignments')
      .update({ scheduled_class_id: null })
      .eq('id', assignment_id)
      .eq('scheduled_class_id', params.classId);

    if (error) throw error;
    return NextResponse.json({ unlinked: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unlink the assignment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
