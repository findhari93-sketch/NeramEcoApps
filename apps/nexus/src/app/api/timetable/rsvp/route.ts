import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { tallyReasons } from '@/lib/rsvp-reasons';
import { writeRsvp } from '@/lib/rsvp-write';

/**
 * Class RSVP, on a default-attending model.
 *
 * Every enrolled student is attending every class. Only opt-outs are stored, so
 * the ABSENCE of a row means attending. There is deliberately no "no response"
 * state: a student who never touches this is not undecided, they are coming.
 *
 * Consequences that drive the code below:
 *  - Opting back in DELETES the row rather than writing response='attending'.
 *    One representation of one fact, and nothing to reconcile when the roster
 *    changes mid-week.
 *  - The teacher's attending count is derived (roster minus opt-outs), never
 *    counted from rows.
 *  - Rows with response='attending' predate this model. They are still read
 *    correctly (treated as attending, same as no row) but are never written.
 */

/** Resolve the caller and their enrollment in one place. */
async function resolveCaller(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  msOid: string,
  classroomId: string,
) {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('ms_oid', msOid)
    .single();

  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .maybeSingle();

  if (!enrollment) {
    return { error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) };
  }

  return { userId: user.id as string, role: enrollment.role as string };
}

/** Verify the class really belongs to the classroom the caller claims. */
async function assertClassInClassroom(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  classId: string,
  classroomId: string,
) {
  const { data } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title')
    .eq('id', classId)
    .eq('classroom_id', classroomId)
    .single();
  return data;
}

/**
 * GET /api/timetable/rsvp?class_id={id}&classroom_id={id}
 *
 * Teachers get the opt-out list plus a derived attending count.
 * Students get their own row, or null when they are attending (the default).
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    if (!classId || !classroomId) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const caller = await resolveCaller(supabase, msUser.oid, classroomId);
    if ('error' in caller) return caller.error;

    if (!(await assertClassInClassroom(supabase, classId, classroomId))) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    if (caller.role === 'teacher') {
      // Roster size is the denominator: attending is everyone who has NOT
      // opted out, so it must be counted from enrollments, not from RSVP rows.
      const [{ count: rosterSize }, { data: rows, error }] = await Promise.all([
        supabase
          .from('nexus_enrollments')
          .select('user_id', { count: 'exact', head: true })
          .eq('classroom_id', classroomId)
          .eq('role', 'student')
          .eq('is_active', true)
          // Paused students are in no count (founder rule, 2026-09-13).
          .eq('participation_status', 'active'),
        supabase
          .from('nexus_class_rsvp')
          .select('*, student:users!nexus_class_rsvp_student_id_fkey(id, name, avatar_url)')
          .eq('scheduled_class_id', classId)
          .eq('response', 'not_attending')
          .order('responded_at', { ascending: false }),
      ]);

      if (error) throw error;

      const optedOut = rows || [];
      const total = rosterSize ?? 0;

      return NextResponse.json({
        optedOut,
        reasonTally: tallyReasons(optedOut),
        summary: {
          // Derived, never counted from rows. Clamped so a stale opt-out from a
          // student who has since left the classroom cannot show a negative.
          attending: Math.max(total - optedOut.length, 0),
          not_attending: optedOut.length,
          total,
        },
        // Kept for older clients that still read `rsvps`.
        rsvps: optedOut,
      });
    }

    const { data, error } = await supabase
      .from('nexus_class_rsvp')
      .select('*')
      .eq('scheduled_class_id', classId)
      .eq('student_id', caller.userId)
      .maybeSingle();

    if (error) throw error;

    // No row, or a legacy 'attending' row, both mean attending.
    return NextResponse.json({ rsvp: data?.response === 'not_attending' ? data : null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load RSVPs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/rsvp
 *
 * Body: { class_id, classroom_id, response, reason_code?, reason?, wants_catchup? }
 *
 * response='not_attending' stores the opt-out with a reason code.
 * response='attending' removes any opt-out, restoring the default.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { class_id, classroom_id, response, reason_code, reason, wants_catchup } = body;
    if (!class_id || !classroom_id || !response) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const result = await writeRsvp(supabase, {
      userId: user.id,
      classId: class_id,
      classroomId: classroom_id,
      response,
      reasonCode: reason_code,
      note: reason,
      wantsCatchup: wants_catchup,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ rsvp: result.rsvp, attending: result.attending });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save RSVP';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
