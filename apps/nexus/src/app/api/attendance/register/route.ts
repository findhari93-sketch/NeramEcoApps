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
import {
  AWAY_COLUMNS,
  coveringWindow,
  isMissingTable,
  describeWindow,
  groupByStudent,
  type AwayWindow,
} from '@/lib/away-windows';

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
  counts: RegisterCounts;
}

export interface RegisterCounts {
  whole: number;
  partly: number;
  away: number;
  reason: number;
  noReason: number;
  joinedLater: number;
}

/**
 * Which counter each group increments.
 *
 * A `Record<RegisterGroup, ...>` rather than an if/else chain, so adding a group
 * to the union is a type error here instead of a silent miscount. The chain this
 * replaced ended in a bare `else counts.joinedLater++`, which meant a new group
 * would have been tallied as "joined the course later": a count nobody would
 * question, on the one group that is also excluded from the attendance rate.
 */
const COUNT_KEY: Record<RegisterGroup, keyof RegisterCounts> = {
  whole: 'whole',
  partly: 'partly',
  away: 'away',
  reason: 'reason',
  no_reason: 'noReason',
  joined_later: 'joinedLater',
};

export interface RegisterStudent {
  id: string;
  name: string;
  avatar_url: string | null;
  study_stage: string | null;
  enrolled_at: string | null;
  present: number;
  counted: number;
  rate: number | null;
  /**
   * Classes in this range that a declared away window explains.
   *
   * Reported beside the rate rather than removed from it. See the denominator
   * comment in the class loop: a rate can be lifted by staff, never by the
   * student themselves, so the honest rendering is "40%, 8 away" rather than a
   * number quietly adjusted upward.
   */
  away: number;
  /** The window covering today, in words, or null. */
  away_now: string | null;
}

export interface RegisterResponse {
  classroom_id: string;
  range: { from: string; to: string };
  classes: RegisterClass[];
  students: RegisterStudent[];
  cells: Record<string, Record<string, RegisterCell>>;
  paused_hidden: number;
  /** How many students on this roster are away today. */
  away_today: number;
}

/** Plain date arithmetic on a YYYY-MM-DD, no timezone reinterpretation. */
function ymdDaysAgo(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * PostgREST caps a single request at 1,000 rows by default. Today's volumes
 * (about 39 classes and 37 students over a 90 day range) sit comfortably
 * under that, but a single unpaginated `.in(classIds)` truncates silently the
 * day a classroom grows past it, and a truncated attendance read renders
 * every missing row as a student who did not attend: the exact falsehood an
 * unmeasured class was fixed to stop telling, reappearing through a different
 * door. Paging the read, rather than detecting the cap and failing the whole
 * register, is what keeps the screen working at any size instead of going
 * blank the day a classroom crosses 1,000 rows.
 *
 * `.range()` alone is not enough: Postgres makes no ordering promise without
 * an explicit `ORDER BY`, so without one a row can legally be returned on a
 * different page (or no page) than the one its offset implies, especially if
 * a sync upsert lands mid-pagination. Every call to `fetchAllPages` below
 * orders by its table's own unique pair, so the order is total and a row
 * cannot shift across a page boundary between reads.
 */
const PAGE_SIZE = 1000;
// 20 pages is 20,000 rows: a guard against an infinite loop if a query ever
// stopped shrinking, not a limit this range is expected to reach. Hitting it
// throws (below) rather than returning a quietly short result: an attendance
// read that stops early renders every row past the cutoff as a student who
// did not attend, the same falsehood Finding 1 closed for an unmeasured
// class. An error the teacher sees is the honest outcome, not a register
// that looks complete and is not.
const MAX_PAGES = 20;

async function fetchAllPages(
  buildPage: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: unknown }>,
): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await buildPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
    offset += PAGE_SIZE;
  }
  // A dataset that lands on exactly 20,000 rows, no more, would also reach
  // here (the last page read full and nothing tells us there is no 20,001st
  // row without one more request), so this can in principle false-alarm at
  // that exact boundary. An error asking someone to look is still the
  // honest choice over the alternative, a register that silently renders as
  // complete when it is not.
  throw new Error(`Attendance read did not end after ${MAX_PAGES} pages, refusing to render a possibly truncated register`);
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

    const [{ members, counts: rosterCounts }, attendance, absences, optOuts, awayWindows] =
      await Promise.all([
        loadClassroomRoster(classroomId, { client: supabase }),
        // Each `.order()` pair is the table's own `UNIQUE(scheduled_class_id,
        // student_id)` constraint (nexus_attendance, nexus_class_absences and
        // nexus_class_rsvp all carry it, see their migrations), so the order
        // is total, not merely stable: no two rows can tie on both columns,
        // which is what keeps a row from being able to shift across a page
        // boundary between one page's read and the next's. Without an
        // explicit ORDER BY, Postgres makes no promise about row order at
        // all, so a sync upsert landing mid-pagination could otherwise move a
        // row from an unfetched page to an already-fetched one, or the
        // reverse, and it would never be read either way.
        classIds.length
          ? fetchAllPages((pageFrom, pageTo) =>
              supabase
                .from('nexus_attendance')
                .select(
                  'scheduled_class_id, student_id, attended, joined_at, left_at, duration_minutes, attendance_intervals',
                )
                .in('scheduled_class_id', classIds)
                .order('scheduled_class_id')
                .order('student_id')
                .range(pageFrom, pageTo),
            )
          : Promise.resolve([]),
        classIds.length
          ? fetchAllPages((pageFrom, pageTo) =>
              supabase
                .from('nexus_class_absences')
                .select(
                  'scheduled_class_id, student_id, kind, reason_code, reason_note, excused_at, caught_up_at',
                )
                .in('scheduled_class_id', classIds)
                .order('scheduled_class_id')
                .order('student_id')
                .range(pageFrom, pageTo),
            )
          : Promise.resolve([]),
        classIds.length
          ? fetchAllPages((pageFrom, pageTo) =>
              supabase
                .from('nexus_class_rsvp')
                .select('scheduled_class_id, student_id')
                .eq('response', 'not_attending')
                .in('scheduled_class_id', classIds)
                .order('scheduled_class_id')
                .order('student_id')
                .range(pageFrom, pageTo),
            )
          : Promise.resolve([]),
        // Declared away windows overlapping this range. Read here rather than
        // trusted from a flag stamped onto the absence row, because the window
        // is the truth and the absence row is only a cache of it: a class
        // rescheduled into or out of a window gets the right answer from this
        // read on the very next page load, while a stamped row would keep
        // asserting a student was away on a day they were not.
        //
        // Ordered and paged like the three reads above, for the same reason. A
        // truncated away read does not render as nothing, it renders as
        // "missed, no reason": the same falsehood, through a new door.
        //
        // Wrapped, because this is the one read whose table may legitimately not
        // exist yet: `deploy-nexus` does not depend on `deploy-db-production`,
        // so the app can go live minutes before the migration lands. Without
        // this the whole register 500s during that window, which is a working
        // screen taken down by a table nobody has declared a window in. Only
        // "the table is not there" is swallowed; every other error still throws,
        // for the reason the pagination comment above gives.
        fetchAllPages((pageFrom, pageTo) =>
          supabase
            .from('nexus_student_away_windows')
            .select(AWAY_COLUMNS)
            .is('cancelled_at', null)
            .lte('starts_on', to)
            .or(`ends_on.is.null,ends_on.gte.${from}`)
            .order('student_id')
            .order('id')
            .range(pageFrom, pageTo),
        ).catch((err) => {
          if (isMissingTable(err)) return [];
          throw err;
        }),
      ]);

    const key = (classId: string, studentId: string) => `${classId}:${studentId}`;
    const attByKey = new Map<string, any>(attendance.map((a: any) => [key(a.scheduled_class_id, a.student_id), a]));
    const absByKey = new Map<string, any>(absences.map((a: any) => [key(a.scheduled_class_id, a.student_id), a]));
    const optByKey = new Set<string>(optOuts.map((o: any) => key(o.scheduled_class_id, o.student_id)));
    const attByClass = new Map<string, any[]>();
    for (const a of attendance) {
      const list = attByClass.get(a.scheduled_class_id) || [];
      list.push(a);
      attByClass.set(a.scheduled_class_id, list);
    }

    // Not scoped to the roster: a window is a fact about a student, not about a
    // classroom, and the lookup below only ever asks about roster members, so
    // another classroom's rows are inert. Keeping the filter off the query means
    // no `.in()` list to chunk as the school grows.
    const awayByStudent = groupByStudent(awayWindows as AwayWindow[]);
    const todayYmd = istTodayYmd();

    const tally = new Map<string, { present: number; counted: number; away: number }>(
      members.map((m: any) => [m.user_id as string, { present: 0, counted: 0, away: 0 }]),
    );
    const cells: Record<string, Record<string, RegisterCell>> = {};

    const outClasses: RegisterClass[] = classes.map((cls: any) => {
      const rows = attByClass.get(cls.id) || [];
      const measured = rows.length > 0;
      const window = sessionWindow(cls, rows);
      const counts: RegisterCounts = {
        whole: 0,
        partly: 0,
        away: 0,
        reason: 0,
        noReason: 0,
        joinedLater: 0,
      };
      const classCells: Record<string, RegisterCell> = {};

      // An unmeasured class (Teams attendance never read, or the read failed)
      // has nothing to say about any student. The loop below is skipped
      // entirely rather than run with every `attended` defaulting to false,
      // which is what used to happen: it wrote a cell and a "no reason"
      // count for every enrolled student, so a class that simply had not been
      // synced yet rendered as its whole roster missing. No cell is written
      // here, so RegisterGrid draws its "?" glyph and nothing below ever
      // enters a percentage, matching a batch-excluded student's own
      // no-cell treatment.
      for (const m of measured ? (members as any[]) : []) {
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
          away: !!coveringWindow(awayByStudent.get(m.user_id) || [], cls.scheduled_date),
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

        counts[COUNT_KEY[group]]++;

        // A class nobody has read attendance for measures nothing, and a student
        // who was not yet enrolled is not owed that class either. An excused
        // absence is dropped from the denominator too, not just skipped for
        // "present": excusing a class is the teacher saying this one is not
        // held against the student, and counting it in `counted` while never
        // in `present` would still mark them down for it, which is the exact
        // opposite of what excusing means.
        //
        // A declared away window is NOT dropped from the denominator, and the
        // difference from an excuse is the whole of the reasoning. `excused_at`
        // is a teacher's act, audited by `excused_by` and `excuse_note`. An away
        // window is the student's own declaration, auto-accepted with nobody
        // approving it. If declaring away removed classes from your own
        // denominator, the attendance rate would be self-reported, and a student
        // who declared open-ended leave on day one would read as 100%. So the
        // window explains why they were not there; it does not unbook the class.
        // The rate is reported with its away count beside it instead, and a
        // teacher who agrees the fortnight should not count has the existing,
        // audited lever: excuse those classes.
        const excused = !!absence?.excused_at;
        const row = tally.get(m.user_id);
        if (row && measured && group !== 'joined_later' && !excused) {
          row.counted++;
          if (group === 'whole' || group === 'partly') row.present++;
          if (group === 'away') row.away++;
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

    let awayToday = 0;
    const students: RegisterStudent[] = (members as any[]).map((m) => {
      const row = tally.get(m.user_id) || { present: 0, counted: 0, away: 0 };
      const nowWindow = coveringWindow(awayByStudent.get(m.user_id) || [], todayYmd);
      if (nowWindow) awayToday++;
      return {
        id: m.user_id,
        name: m.user?.name || 'Student',
        avatar_url: m.user?.avatar_url || null,
        study_stage: m.current_standard ?? null,
        enrolled_at: m.enrolled_at ?? null,
        present: row.present,
        counted: row.counted,
        rate: row.counted ? Math.round((row.present / row.counted) * 100) : null,
        away: row.away,
        away_now: nowWindow ? describeWindow(nowWindow, todayYmd) : null,
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
        away_today: awayToday,
      } satisfies RegisterResponse,
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the register';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
