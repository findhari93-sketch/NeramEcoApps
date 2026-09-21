import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd, loadClassroomRoster } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { canUser } from '@/lib/staff-capabilities';
import { joinedAfterClass } from '@/lib/attendance-quality';
import { presenceOf, registerGroupOf, sessionWindow } from '@/lib/attendance-register';
import {
  coveringWindow,
  describeWindow,
  groupByStudent,
  loadAwayWindows,
  reviewOverdue,
} from '@/lib/away-windows';
import { loadCatchupOpenCounts } from '@/lib/catchup-open-counts';
import { attendanceStanding, type Standing } from '@/lib/attendance-standing';

/**
 * GET /api/attendance/standing?classroom_id=&from=&to=   (staff)
 *
 * One row per student: where they stand over this range, and why.
 *
 * READ ONLY, like the register it sits beside. Nothing here inserts, updates or
 * deletes, and route.test.ts fails if that changes.
 *
 * Served separately from /api/attendance/register rather than widening it. This
 * one resolves the whole catch-up backlog and reads sign-in events, which is
 * several times the work; the two views that already shipped must not get slower
 * because a third exists. The client leaves its SWR key null until the Students
 * view is actually opened.
 *
 * The verdict itself is not computed here. It comes from attendanceStanding in
 * lib/attendance-standing.ts, and the per-class grouping from registerGroupOf,
 * so this screen and the register cannot disagree about the same student.
 */

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE_DAYS = 30;

export interface StandingRow {
  id: string;
  name: string;
  avatar_url: string | null;
  study_stage: string | null;
  enrolled_at: string | null;
  /**
   * The batch they sit in, or null for a whole-classroom member.
   *
   * Carried so a caller can tell whether this student was even invited to a
   * given class without fetching a second roster. The timetable forecast needs
   * it, and joining two independently fetched rosters is a drift bug waiting
   * to happen.
   */
  batch_id: string | null;
  standing: Standing;
  reasons: string[];
  /** Null when nothing in the range was measured. Never 0. */
  rate: number | null;
  present: number;
  counted: number;
  away: number;
  unexplained: number;
  open_backlog: number;
  blocked_on_us: number;
  last_seen_at: string | null;
  never_entered: boolean;
  away_now: string | null;
}

export interface StandingResponse {
  classroom_id: string;
  range: { from: string; to: string };
  students: StandingRow[];
  paused_hidden: number;
  /** Classes in the range that Teams attendance has never been read for. */
  unmeasured_classes: number;
}

function ymdDaysAgo(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function hasEnded(scheduledDate: string, endTime: string, now: number): boolean {
  const endMs = Date.parse(`${scheduledDate}T${endTime}+05:30`);
  return Number.isFinite(endMs) && endMs < now;
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

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }
    const today = istTodayYmd();
    const to = request.nextUrl.searchParams.get('to') || today;
    const from = request.nextUrl.searchParams.get('from') || ymdDaysAgo(to, DEFAULT_RANGE_DAYS);

    const { data: rawClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, scheduled_date, start_time, end_time, batch_id')
      .eq('classroom_id', classroomId)
      .eq('kind', 'lecture')
      .eq('publish_state', 'published')
      .not('status', 'in', '(cancelled,rescheduled)')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to);

    const now = Date.now();
    const classes = (rawClasses || []).filter((c: any) => hasEnded(c.scheduled_date, c.end_time, now));
    const classIds = classes.map((c: any) => c.id);

    const [{ members, counts: rosterCounts }, attendanceRes, awayWindows, backlog, signIns] =
      await Promise.all([
        loadClassroomRoster(classroomId, { client: supabase }),
        classIds.length
          ? supabase
              .from('nexus_attendance')
              .select(
                'scheduled_class_id, student_id, attended, joined_at, left_at, attendance_intervals',
              )
              .in('scheduled_class_id', classIds)
          : Promise.resolve({ data: [] }),
        loadAwayWindows(supabase, { from, to: today }),
        loadCatchupOpenCounts(supabase, classroomId, today),
        // The per-open log, not nexus_last_login_at: it is throttled to one row
        // per 30 minutes and never written during impersonation, which is what
        // makes "not seen in Nexus for 24 days" a claim worth putting on screen.
        supabase
          .from('nexus_sign_in_events')
          .select('user_id, occurred_at')
          .order('occurred_at', { ascending: false })
          .limit(4000),
      ]);

    const attendance = (attendanceRes as any).data || [];
    const key = (c: string, s: string) => `${c}:${s}`;
    const attByKey = new Map<string, any>(
      attendance.map((a: any) => [key(a.scheduled_class_id, a.student_id), a]),
    );
    const attByClass = new Map<string, any[]>();
    for (const a of attendance) {
      const list = attByClass.get(a.scheduled_class_id) || [];
      list.push(a);
      attByClass.set(a.scheduled_class_id, list);
    }

    const awayByStudent = groupByStudent(awayWindows);
    const lastSeen = new Map<string, string>();
    for (const e of (signIns as any).data || []) {
      if (!lastSeen.has(e.user_id)) lastSeen.set(e.user_id, e.occurred_at);
    }

    const { data: entered } = await supabase
      .from('users')
      .select('id, nexus_entered_at')
      .in(
        'id',
        (members as any[]).map((m) => m.user_id),
      );
    const enteredById = new Map<string, string | null>(
      (entered || []).map((u: any) => [u.id, u.nexus_entered_at]),
    );

    const tallies = new Map(
      (members as any[]).map((m) => [
        m.user_id as string,
        { counted: 0, present: 0, away: 0, unexplainedMissed: 0 },
      ]),
    );

    let unmeasured = 0;
    for (const cls of classes) {
      const rows = attByClass.get(cls.id) || [];
      // The rule the register learned first: a class Teams was never read for
      // says nothing about anybody. Scoring it would report a whole roster as
      // missing every evening between the class ending and the sync cron.
      if (rows.length === 0) {
        unmeasured++;
        continue;
      }
      const window = sessionWindow(cls, rows);

      for (const m of members as any[]) {
        if (cls.batch_id && m.batch_id !== cls.batch_id) continue;
        const a = attByKey.get(key(cls.id, m.user_id));
        const attended = !!a?.attended;
        const group = registerGroupOf({
          attended,
          presence: attended ? presenceOf(a, window) : null,
          joinedAfterClass: joinedAfterClass(m.enrolled_at, cls.scheduled_date),
          away: !!coveringWindow(awayByStudent.get(m.user_id) || [], cls.scheduled_date),
        });
        if (group === 'joined_later') continue;

        const t = tallies.get(m.user_id);
        if (!t) continue;
        t.counted++;
        if (group === 'whole' || group === 'partly') t.present++;
        if (group === 'away') t.away++;
        if (group === 'no_reason') t.unexplainedMissed++;
      }
    }

    const students: StandingRow[] = (members as any[]).map((m) => {
      const t = tallies.get(m.user_id) || { counted: 0, present: 0, away: 0, unexplainedMissed: 0 };
      const windows = awayByStudent.get(m.user_id) || [];
      const nowWindow = coveringWindow(windows, today);
      const counts = backlog.get(m.user_id) ?? null;
      const enteredAt = enteredById.get(m.user_id) ?? null;

      const verdict = attendanceStanding({
        today,
        enrolledAt: m.enrolled_at ?? null,
        // Null, never a zeroed object. The difference between "missed
        // everything" and "we never looked" is the whole of the honesty rule.
        attendance: t.counted > 0 ? t : null,
        away: nowWindow
          ? { endsOn: nowWindow.ends_on, reviewOverdue: reviewOverdue(nowWindow, today) }
          : null,
        catchup: counts,
        seen: {
          lastSeenAt: lastSeen.get(m.user_id) ?? null,
          neverEntered: !enteredAt,
        },
      });

      return {
        id: m.user_id,
        name: m.user?.name || 'Student',
        avatar_url: m.user?.avatar_url || null,
        study_stage: m.current_standard ?? null,
        enrolled_at: m.enrolled_at ?? null,
        batch_id: m.batch_id ?? null,
        standing: verdict.standing,
        reasons: verdict.reasons,
        rate: t.counted ? Math.round((t.present / t.counted) * 100) : null,
        present: t.present,
        counted: t.counted,
        away: t.away,
        unexplained: t.unexplainedMissed,
        open_backlog: counts?.ownOpen ?? 0,
        blocked_on_us: counts?.blockedOnUs ?? 0,
        last_seen_at: lastSeen.get(m.user_id) ?? null,
        never_entered: !enteredAt,
        away_now: nowWindow ? describeWindow(nowWindow, today) : null,
      };
    });

    return NextResponse.json(
      {
        classroom_id: classroomId,
        range: { from, to },
        students,
        paused_hidden: rosterCounts?.dormant ?? 0,
        unmeasured_classes: unmeasured,
      } satisfies StandingResponse,
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load standings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
