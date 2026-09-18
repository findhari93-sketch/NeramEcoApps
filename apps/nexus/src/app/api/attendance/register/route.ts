import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd, loadClassroomRoster } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { canUser } from '@/lib/staff-capabilities';
import { joinedAfterClass } from '@/lib/attendance-quality';
import {
  presenceOf,
  registerGroupOf,
  sessionWindow,
  type RegisterGroup,
} from '@/lib/attendance-register';

/**
 * GET /api/attendance/register?classroom_id=&from=&to=   (staff)
 *
 * The whole register in one request: every class that has already happened in
 * the range, every student, and which group each student is in for each class.
 * The Classes list and the grid are two readings of this one payload.
 *
 * READ ONLY, deliberately. The screen this replaced wrote absence rows on every
 * GET, so opening a class to look at it changed the data underneath. Nothing
 * here inserts, updates or deletes, and route.test.ts fails if that changes.
 */

// Per-user authentication on every request, so this cannot be statically
// rendered. The client makes one SWR request per page view and the response
// carries a short private cache.
export const dynamic = 'force-dynamic';

const DEFAULT_RANGE_DAYS = 30;

export interface RegisterCell {
  g: RegisterGroup;
  min?: number;
  late?: number;
  early?: number;
  out?: number;
}

export interface RegisterClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  held: { start: string; end: string; source: 'observed' | 'booked'; minutes: number } | null;
  measured: boolean;
  sync_status: string | null;
  counts: { whole: number; partly: number; reason: number; noReason: number; joinedLater: number };
}

export interface RegisterStudent {
  id: string;
  name: string;
  avatar_url: string | null;
  study_stage: string | null;
  enrolled_at: string | null;
  present: number;
  counted: number;
  rate: number | null;
}

export interface RegisterResponse {
  classroom_id: string;
  range: { from: string; to: string };
  classes: RegisterClass[];
  students: RegisterStudent[];
  cells: Record<string, Record<string, RegisterCell>>;
  paused_hidden: number;
}

/** Plain date arithmetic on a YYYY-MM-DD, no timezone reinterpretation. */
function ymdDaysAgo(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Has this class finished?
 *
 * Nothing in production ever flips a past class to `completed`, so the status
 * column cannot answer this. The clock can.
 */
function hasEnded(scheduledDate: string, endTime: string, now: number): boolean {
  const endMs = Date.parse(`${scheduledDate}T${endTime}+05:30`);
  return Number.isFinite(endMs) && endMs < now;
}

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // The capability, not user_type === 'admin': the staff tiers exist so a
    // coordinator can read attendance without being an admin.
    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'coord.attendance.view')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }
    const to = request.nextUrl.searchParams.get('to') || istTodayYmd();
    const from = request.nextUrl.searchParams.get('from') || ymdDaysAgo(to, DEFAULT_RANGE_DAYS);

    // Lectures only: an exam row is not a class anybody attends.
    const { data: rawClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, end_time, batch_id, attendance_sync_status')
      .eq('classroom_id', classroomId)
      .eq('kind', 'lecture')
      .eq('publish_state', 'published')
      .not('status', 'in', '(cancelled,rescheduled)')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date', { ascending: false })
      .order('start_time', { ascending: false });

    const now = Date.now();
    const classes = (rawClasses || []).filter((c: any) => hasEnded(c.scheduled_date, c.end_time, now));
    const classIds = classes.map((c: any) => c.id);

    const empty = { data: [] as any[] };
    const [{ members, counts: rosterCounts }, { data: attendance }, { data: absences }, { data: optOuts }] =
      await Promise.all([
        loadClassroomRoster(classroomId, { client: supabase }),
        classIds.length
          ? supabase
              .from('nexus_attendance')
              .select(
                'scheduled_class_id, student_id, attended, joined_at, left_at, duration_minutes, attendance_intervals',
              )
              .in('scheduled_class_id', classIds)
          : empty,
        classIds.length
          ? supabase
              .from('nexus_class_absences')
              .select(
                'scheduled_class_id, student_id, kind, reason_code, reason_note, excused_at, caught_up_at',
              )
              .in('scheduled_class_id', classIds)
          : empty,
        classIds.length
          ? supabase
              .from('nexus_class_rsvp')
              .select('scheduled_class_id, student_id')
              .eq('response', 'not_attending')
              .in('scheduled_class_id', classIds)
          : empty,
      ]);

    const key = (classId: string, studentId: string) => `${classId}:${studentId}`;
    const attByKey = new Map<string, any>((attendance || []).map((a: any) => [key(a.scheduled_class_id, a.student_id), a]));
    const absByKey = new Map<string, any>((absences || []).map((a: any) => [key(a.scheduled_class_id, a.student_id), a]));
    const optByKey = new Set<string>((optOuts || []).map((o: any) => key(o.scheduled_class_id, o.student_id)));
    const attByClass = new Map<string, any[]>();
    for (const a of attendance || []) {
      const list = attByClass.get(a.scheduled_class_id) || [];
      list.push(a);
      attByClass.set(a.scheduled_class_id, list);
    }

    const tally = new Map<string, { present: number; counted: number }>(
      members.map((m: any) => [m.user_id as string, { present: 0, counted: 0 }]),
    );
    const cells: Record<string, Record<string, RegisterCell>> = {};

    const outClasses: RegisterClass[] = classes.map((cls: any) => {
      const rows = attByClass.get(cls.id) || [];
      const measured = rows.length > 0;
      const window = sessionWindow(cls, rows);
      const counts = { whole: 0, partly: 0, reason: 0, noReason: 0, joinedLater: 0 };
      const classCells: Record<string, RegisterCell> = {};

      for (const m of members as any[]) {
        // A class limited to one batch is only about that batch's students. A
        // member with no batch_id at all is not in THIS batch, so they must be
        // excluded too: `m.batch_id !== cls.batch_id` alone handles that,
        // because null !== cls.batch_id is true. The old `m.batch_id &&` guard
        // short-circuited on a null batch_id and let every unbatched member
        // through, which is the one predicate the roster query itself avoids by
        // using `.eq` (SQL .eq never matches NULL).
        if (cls.batch_id && m.batch_id !== cls.batch_id) continue;

        const a = attByKey.get(key(cls.id, m.user_id));
        const attended = !!a?.attended;
        const presence = attended ? presenceOf(a, window) : null;
        const absence = absByKey.get(key(cls.id, m.user_id)) ?? null;
        const group = registerGroupOf({
          attended,
          presence,
          joinedAfterClass: joinedAfterClass(m.enrolled_at, cls.scheduled_date),
          rsvp: optByKey.has(key(cls.id, m.user_id)) ? 'not_attending' : 'attending',
          absence,
        });

        const cell: RegisterCell = { g: group };
        if (presence?.timesKnown) {
          cell.min = presence.minutesIn;
          if (presence.lateByMin) cell.late = presence.lateByMin;
          if (presence.leftEarlyByMin) cell.early = presence.leftEarlyByMin;
          if (presence.outMin) cell.out = presence.outMin;
        }
        classCells[m.user_id] = cell;

        if (group === 'whole') counts.whole++;
        else if (group === 'partly') counts.partly++;
        else if (group === 'reason') counts.reason++;
        else if (group === 'no_reason') counts.noReason++;
        else counts.joinedLater++;

        // A class nobody has read attendance for measures nothing, and a student
        // who was not yet enrolled is not owed that class either. An excused
        // absence is dropped from the denominator too, not just skipped for
        // "present": excusing a class is the teacher saying this one is not
        // held against the student, and counting it in `counted` while never
        // in `present` would still mark them down for it, which is the exact
        // opposite of what excusing means.
        const excused = !!absence?.excused_at;
        const row = tally.get(m.user_id);
        if (row && measured && group !== 'joined_later' && !excused) {
          row.counted++;
          if (group === 'whole' || group === 'partly') row.present++;
        }
      }

      cells[cls.id] = classCells;
      return {
        id: cls.id,
        title: cls.title,
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
        held: measured
          ? {
              start: new Date(window.startMs).toISOString(),
              end: new Date(window.endMs).toISOString(),
              source: window.source,
              minutes: window.minutes,
            }
          : null,
        measured,
        sync_status: cls.attendance_sync_status ?? null,
        counts,
      };
    });

    const students: RegisterStudent[] = (members as any[]).map((m) => {
      const row = tally.get(m.user_id) || { present: 0, counted: 0 };
      return {
        id: m.user_id,
        name: m.user?.name || 'Student',
        avatar_url: m.user?.avatar_url || null,
        study_stage: m.current_standard ?? null,
        enrolled_at: m.enrolled_at ?? null,
        present: row.present,
        counted: row.counted,
        rate: row.counted ? Math.round((row.present / row.counted) * 100) : null,
      };
    });

    return NextResponse.json(
      {
        classroom_id: classroomId,
        range: { from, to },
        classes: outClasses,
        students,
        cells,
        // packages/database/src/queries/nexus/roster.ts's `counts` is
        // { tracked, dormant, total }, so `dormant` is the honest field for the
        // paused students this register leaves out of the roster.
        paused_hidden: rosterCounts?.dormant ?? 0,
      } satisfies RegisterResponse,
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the register';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
