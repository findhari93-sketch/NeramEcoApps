import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { tallyReasons } from '@/lib/rsvp-reasons';

/**
 * GET /api/timetable/rsvp-dashboard?classroom_id={id}&class_id={id}
 * OR
 * GET /api/timetable/rsvp-dashboard?classroom_id={id}&start={date}&end={date}
 *
 * Teacher-only. Splits the roster into attending and opted out, with the reason
 * behind each opt-out and a tally by reason code.
 *
 * On the default-attending model there is no "no response" bucket: a student
 * with no RSVP row is attending.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const classId = request.nextUrl.searchParams.get('class_id');
    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Verify teacher role
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
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can view the RSVP dashboard' }, { status: 403 });
    }

    // Get enrolled students for this classroom
    const { data: students } = await supabase
      .from('nexus_enrollments')
      .select('user_id, batch_id, user:users!nexus_enrollments_user_id_fkey(id, name, avatar_url)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    const allStudents = (students || []).map((s: any) => ({
      id: s.user_id,
      name: s.user?.name || 'Unknown',
      avatar_url: s.user?.avatar_url || null,
      batch_id: s.batch_id,
    }));

    if (classId) {
      const byClass = await fetchOptOuts(supabase, [classId]);
      return NextResponse.json(buildBreakdown(byClass.get(classId) || [], allStudents));
    }

    if (start && end) {
      const { data: classes } = await supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date, start_time, end_time, batch_id, status')
        .eq('classroom_id', classroomId)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true });

      // One query for the whole week rather than one per class. A six-class
      // week used to cost six round trips to build the same answer.
      const classIds = (classes || []).map((c: any) => c.id);
      const byClass = await fetchOptOuts(supabase, classIds);

      const breakdowns = (classes || []).map((cls: any) => ({
        class_id: cls.id,
        title: cls.title,
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
        batch_id: cls.batch_id,
        status: cls.status,
        ...buildBreakdown(byClass.get(cls.id) || [], allStudents),
      }));

      return NextResponse.json({ classes: breakdowns });
    }

    return NextResponse.json({ error: 'Provide class_id or start+end date range' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load RSVP dashboard';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface StudentRow {
  id: string;
  name: string;
  avatar_url: string | null;
  batch_id: string | null;
}

/** Every opt-out for the given classes, grouped by class id. One query. */
async function fetchOptOuts(supabase: any, classIds: string[]): Promise<Map<string, any[]>> {
  const byClass = new Map<string, any[]>();
  if (classIds.length === 0) return byClass;

  const { data } = await supabase
    .from('nexus_class_rsvp')
    .select('scheduled_class_id, student_id, reason, reason_code, wants_catchup, responded_at')
    .in('scheduled_class_id', classIds)
    .eq('response', 'not_attending');

  for (const row of data || []) {
    const list = byClass.get(row.scheduled_class_id) || [];
    list.push(row);
    byClass.set(row.scheduled_class_id, list);
  }
  return byClass;
}

/**
 * Split the roster into attending and opted out.
 *
 * There is deliberately no third bucket. A student with no RSVP row has not
 * "failed to respond", they are attending, which is what the default means. The
 * old no_response bucket made every class look half-unanswered and gave
 * teachers a list to chase that should never have existed.
 */
function buildBreakdown(optOutRows: any[], allStudents: StudentRow[]) {
  const optOutById = new Map<string, any>(optOutRows.map((r) => [r.student_id, r]));

  const attending: any[] = [];
  const notAttending: any[] = [];

  for (const student of allStudents) {
    const optOut = optOutById.get(student.id);
    if (optOut) {
      notAttending.push({
        ...student,
        reason: optOut.reason || null,
        reason_code: optOut.reason_code || null,
        wants_catchup: optOut.wants_catchup !== false,
        responded_at: optOut.responded_at,
      });
    } else {
      attending.push({ ...student });
    }
  }

  return {
    attending,
    not_attending: notAttending,
    reason_tally: tallyReasons(notAttending),
    summary: {
      attending: attending.length,
      not_attending: notAttending.length,
      total: allStudents.length,
    },
  };
}
