import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { fetchAllRows, getSupabaseAdminClient, istTodayYmd, loadClassroomRoster } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { CLASS_KIND_LECTURE } from '@/lib/class-kind';
import { NOT_TAUGHT_NOTE } from '@/lib/class-not-taught';
import { classHealth, type CalendarClass } from '@/lib/catchup-calendar';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/catchup/calendar?classroomId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Every class in a date range with how its catch-up stands: who was there, who
 * missed it, how many have caught up, and whether we still owe a recap. One row
 * per class, for the Catch-up calendar and the badges on the Timetable.
 *
 * Replaces the "Classes and recaps" list, which rode on the overview payload
 * capped at the 60 most recent classes and could only be scrolled. Scoped to a
 * range (a month, or the week the timetable shows), so it costs the same in
 * week one and week forty.
 *
 * Deliberately lighter than the overview: counts only. The per-student detail
 * for one class (who, why, how far they got) is read when a class is opened,
 * by the attendance panel, and never for thirty classes at once.
 */

/** A month view plus its leading and trailing days. */
const MAX_RANGE_DAYS = 45;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'coord.attendance.view')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroomId');
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    if (!classroomId || !YMD.test(from) || !YMD.test(to) || from > to) {
      return NextResponse.json({ error: 'classroomId, from and to (YYYY-MM-DD) are required' }, { status: 400 });
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `A range can span at most ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }

    const [{ data: classRows, error: classErr }, roster] = await Promise.all([
      supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date, start_time, recording_url, youtube_url, transcript_url, teams_meeting_id')
        .eq('classroom_id', classroomId)
        // Taught classes only: an exam is a timetable row with nothing to catch
        // up on, and rendered as a class permanently owing a recap.
        .eq('kind', CLASS_KIND_LECTURE)
        .eq('publish_state', 'published')
        .neq('status', 'cancelled')
        .gte('scheduled_date', from)
        .lte('scheduled_date', to)
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true }),
      // Default roster: dormant students are in no count anywhere in Nexus.
      loadClassroomRoster<any>(classroomId, { client: supabase }),
    ]);
    if (classErr) throw classErr;

    const classes = classRows || [];
    const classIds = classes.map((c: any) => c.id as string);
    const tracked = new Set<string>(roster.members.map((m: any) => m.user_id as string));

    if (classIds.length === 0) {
      return NextResponse.json({ classroomId, from, to, today: istTodayYmd(), classes: [] });
    }

    // Paged: a month of attendance for a full class passes PostgREST's
    // 1000-row ceiling, which truncates silently. See fetchAllRows.
    const [absenceRows, attendanceRows, recaps] = await Promise.all([
      fetchAllRows<any>(() =>
        supabase
          .from('nexus_class_absences')
          .select('id, scheduled_class_id, student_id, kind, caught_up_at, excused_at, excuse_note')
          .in('scheduled_class_id', classIds)
          .order('id'),
      ),
      fetchAllRows<any>(() =>
        supabase
          .from('nexus_attendance')
          .select('id, scheduled_class_id, student_id, attended')
          .in('scheduled_class_id', classIds)
          .eq('attended', true)
          .order('id'),
      ),
      supabase
        .from('nexus_class_recaps')
        .select('id, scheduled_class_id, status, readiness')
        .in('scheduled_class_id', classIds),
    ]);
    if (recaps.error) throw recaps.error;

    const recapByClass = new Map<string, any>();
    for (const r of recaps.data || []) recapByClass.set(r.scheduled_class_id, r);

    const present = new Map<string, number>();
    for (const a of attendanceRows) {
      if (!a.attended || !tracked.has(a.student_id)) continue;
      present.set(a.scheduled_class_id, (present.get(a.scheduled_class_id) || 0) + 1);
    }

    const today = istTodayYmd();
    const stat = new Map<string, { missed: number; lateJoiners: number; caughtUp: number; open: number; notTaught: boolean }>();
    for (const a of absenceRows) {
      const s = stat.get(a.scheduled_class_id) || { missed: 0, lateJoiners: 0, caughtUp: 0, open: 0, notTaught: false };
      if (a.excuse_note === NOT_TAUGHT_NOTE) s.notTaught = true;
      if (tracked.has(a.student_id)) {
        if (a.kind === 'late_joiner') s.lateJoiners += 1;
        else s.missed += 1;
        if (a.caught_up_at || a.excused_at) s.caughtUp += 1;
        else s.open += 1;
      }
      stat.set(a.scheduled_class_id, s);
    }

    const out: CalendarClass[] = classes.map((c: any) => {
      const s = stat.get(c.id) || { missed: 0, lateJoiners: 0, caughtUp: 0, open: 0, notTaught: false };
      const recap = recapByClass.get(c.id);
      const recapState: CalendarClass['recap_state'] =
        recap?.status === 'published'
          ? 'published'
          : recap
            ? 'draft'
            : c.recording_url || c.youtube_url
              ? 'recording_ready'
              : 'no_recording';
      const notTaught = s.notTaught || recap?.readiness === 'not_applicable';
      // Students who cannot move because we owe the recap or the recording.
      const blocked = recapState === 'published' ? 0 : s.open;
      const row = {
        id: c.id,
        title: c.title,
        scheduled_date: String(c.scheduled_date).slice(0, 10),
        start_time: c.start_time ?? null,
        present: present.get(c.id) || 0,
        missed: s.missed,
        late_joiners: s.lateJoiners,
        caughtUp: s.caughtUp,
        outstanding: s.open,
        blocked,
        recap_state: recapState,
        recap_id: recap?.id ?? null,
        has_transcript: !!c.transcript_url,
        teams_meeting_id: c.teams_meeting_id ?? null,
        not_taught: notTaught,
      };
      return { ...row, health: classHealth(row, today) };
    });

    return NextResponse.json({ classroomId, from, to, today, classes: out });
  } catch (err) {
    // 401 for a missing or expired token, not 500: see httpStatusForError.
    return errorResponse(err, 'Failed to load the catch-up calendar');
  }
}
