import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { loadPlanShapes } from '@/lib/plan-shape-query';

const CLASS_SELECT = `*, topic:nexus_topics(id, title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url), batch:nexus_batches!nexus_scheduled_classes_batch_id_fkey(id, name), classroom:nexus_classrooms!nexus_scheduled_classes_classroom_id_fkey(id, name, type)`;

/**
 * GET /api/timetable/my-schedule?start={date}&end={date}
 *
 * Everything the timetable needs for one week, in one request: classes from
 * every classroom the user is enrolled in, plus their own RSVPs, their own
 * attendance and the holidays in range.
 *
 * The page used to fetch the RSVP and the attendance for each class
 * individually, which cost 2N extra function invocations per load (12 on a
 * six-class week) plus a separate holidays call. Those are folded in here as
 * three set-based queries whose cost does not grow with the number of classes.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start and end parameters' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id, role, batch_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({
        classes: [],
        classrooms: [],
        rsvps: {},
        attendance: {},
        holidays: {},
        planShapes: [],
        openAbsences: [],
      });
    }

    // Fetch classes from all enrolled classrooms in parallel
    const classPromises = enrollments.map(async (enrollment) => {
      let query = supabase
        .from('nexus_scheduled_classes')
        .select(CLASS_SELECT)
        .eq('classroom_id', enrollment.classroom_id)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true });

      // For students: filter by batch (classroom-wide + their batch), and hide
      // classes the teacher is still drafting.
      if (enrollment.role === 'student') {
        query = query.eq('publish_state', 'published');
        if (enrollment.batch_id) {
          query = query.or(`batch_id.is.null,batch_id.eq.${enrollment.batch_id}`);
        } else {
          query = query.is('batch_id', null);
        }
      }

      const { data } = await query;
      return data || [];
    });

    const allClassArrays = await Promise.all(classPromises);
    const allClasses = allClassArrays.flat();

    // Deduplicate by class ID (student could be in multiple enrollments pointing to same class)
    const seen = new Set<string>();
    const uniqueClasses = allClasses.filter((cls) => {
      if (seen.has(cls.id)) return false;
      seen.add(cls.id);
      return true;
    });

    // Sort merged results by date then time
    uniqueClasses.sort((a, b) => {
      const dateCompare = a.scheduled_date.localeCompare(b.scheduled_date);
      if (dateCompare !== 0) return dateCompare;
      return a.start_time.localeCompare(b.start_time);
    });

    // Build unique classrooms list
    const classroomMap = new Map<string, { id: string; name: string; type: string }>();
    for (const cls of uniqueClasses) {
      if (cls.classroom && !classroomMap.has(cls.classroom.id)) {
        classroomMap.set(cls.classroom.id, cls.classroom);
      }
    }

    const classIds = uniqueClasses.map((c) => c.id);
    const classroomIds = [...new Set(enrollments.map((e) => e.classroom_id))];

    // Three set-based lookups, whatever the class count. Each is independently
    // optional: a failure degrades one badge, it must not blank the timetable.
    const [rsvpResult, attendanceResult, holidayResult, planResult, absenceResult] =
      await Promise.allSettled([
      classIds.length
        ? supabase
            .from('nexus_class_rsvp')
            .select('scheduled_class_id, response, reason, reason_code, wants_catchup')
            // Only opt-outs are meaningful: no row means attending, and legacy
            // response='attending' rows mean the same thing.
            .eq('student_id', user.id)
            .eq('response', 'not_attending')
            .in('scheduled_class_id', classIds)
        : Promise.resolve({ data: [] as any[] }),
      classIds.length
        ? supabase
            .from('nexus_attendance')
            .select('scheduled_class_id, attended, joined_at')
            .eq('student_id', user.id)
            .in('scheduled_class_id', classIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('nexus_classroom_holidays')
        .select('holiday_date, title, description')
        .in('classroom_id', classroomIds)
        .gte('holiday_date', start)
        .lte('holiday_date', end),
      // The course plans covering this week decide the shape of the day
      // (evenings only during the regular year, mornings too once the crash
      // course starts). Served with the schedule so the calendar costs no extra
      // request as the student pages through weeks.
      loadPlanShapes(supabase, classroomIds, start, end),
      // Classes this student missed and has not finished catching up on. NOT
      // limited to the visible week: an absence from a fortnight ago is exactly
      // the one that gets forgotten, so it follows them until it is closed.
      (supabase as any)
        .from('nexus_class_absences')
        .select(
          'scheduled_class_id, kind, reason_code, caught_up_at, class:nexus_scheduled_classes!nexus_class_absences_scheduled_class_id_fkey(id, title, scheduled_date, start_time)',
        )
        .eq('student_id', user.id)
        .is('caught_up_at', null)
        .order('detected_at', { ascending: false })
        .limit(20),
    ]);

    // Keyed by class id. A class absent from this map is one the student is
    // attending, which is the default and the overwhelmingly common case.
    const rsvps: Record<
      string,
      { response: string; reason: string | null; reason_code: string | null; wants_catchup: boolean }
    > = {};
    if (rsvpResult.status === 'fulfilled') {
      for (const r of (rsvpResult.value.data || []) as any[]) {
        rsvps[r.scheduled_class_id] = {
          response: r.response,
          reason: r.reason ?? null,
          reason_code: r.reason_code ?? null,
          wants_catchup: r.wants_catchup !== false,
        };
      }
    }

    const attendance: Record<string, { attended: boolean; joined_at: string | null }> = {};
    if (attendanceResult.status === 'fulfilled') {
      for (const a of (attendanceResult.value.data || []) as any[]) {
        attendance[a.scheduled_class_id] = { attended: !!a.attended, joined_at: a.joined_at ?? null };
      }
    }

    const holidays: Record<string, { title: string; description: string | null }> = {};
    if (holidayResult.status === 'fulfilled') {
      for (const h of (holidayResult.value.data || []) as any[]) {
        holidays[h.holiday_date] = { title: h.title, description: h.description ?? null };
      }
    }

    // No covering plan is a valid state (a classroom whose plan has not been
    // set up yet), and the calendar falls back to the global window.
    const planShapes = planResult.status === 'fulfilled' ? planResult.value : [];

    const openAbsences =
      absenceResult.status === 'fulfilled'
        ? ((absenceResult.value.data || []) as any[])
            .filter((a) => a.class)
            .map((a) => ({
              class_id: a.scheduled_class_id,
              title: a.class.title,
              scheduled_date: a.class.scheduled_date,
              start_time: a.class.start_time,
              kind: a.kind,
              reason_given: !!a.reason_code,
            }))
        : [];

    return NextResponse.json({
      classes: uniqueClasses,
      classrooms: Array.from(classroomMap.values()),
      rsvps,
      attendance,
      holidays,
      planShapes,
      openAbsences,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load schedule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
