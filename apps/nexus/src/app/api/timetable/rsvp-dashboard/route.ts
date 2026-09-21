import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, loadClassroomRoster } from '@neram/database';
import { describeReason, tallyReasons, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { joinedAfterClass } from '@/lib/attendance-quality';
import {
  coveringWindow,
  describeWindow,
  eachDayYmd,
  groupByStudent,
  loadAwayWindows,
  type AwayWindow,
} from '@/lib/away-windows';

/**
 * GET /api/timetable/rsvp-dashboard?classroom_id={id}&class_id={id}
 * OR
 * GET /api/timetable/rsvp-dashboard?classroom_id={id}&start={date}&end={date}
 *
 * Teacher-only. How many students will actually be in the room, and who will
 * not be, split into the two reasons that are not the same thing: a declared
 * away window covering the date, and an opt-out from this one class.
 *
 * On the default-attending model there is no "no response" bucket: a student
 * with no RSVP row is attending.
 *
 * AWAY LEAVES THE DENOMINATOR HERE, AND ONLY HERE. `summary.total` is what a
 * teacher should expect, so a class with 28 on roll and 6 on exam leave reads
 * "18 of 22 expected, 6 away" rather than 18 of 28. A small class that is fully
 * attended is not a failure, and during board-exam season the other reading
 * makes every class look like one.
 *
 * This is the opposite of the rule in /api/attendance/register, and deliberately
 * so. See the long comment at register/route.ts:401-411: a student's attendance
 * RATE must not drop away classes, or the rate becomes self-reported and anyone
 * declaring open-ended leave on day one reads as 100%. That answers "what
 * fraction of classes has this student attended". This route answers "how many
 * chairs do I need tonight". Two different questions, two different
 * denominators, and neither should be "fixed" to match the other.
 *
 * Away is also applied retrospectively: a window declared on the 15th that
 * covers the 3rd moves the 3rd's denominator. That is the same choice
 * register/route.ts:280-285 already makes, where the window is the truth and the
 * absence row is only a cache of it. One rule for past and future classes; two
 * rules would be worse than the surprise.
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How many per-date rows one response may carry.
 *
 * The class rows cost whatever the classroom scheduled. The day rows cost one
 * entry per DATE, so an unbounded span is the one thing that can turn this
 * cheap response into a large one: a year asked for at
 * timetable-availability-nexus.spec.ts:69 would be 365 rows of ids. The
 * planner never looks past 30 days and a month grid is at most 42. The page
 * asks for both at once (planningRangeFor unions them), and the worst case is
 * today sitting on the last cell of the grid: 42 + 29 = 71 days. 75 covers that
 * with slack, at roughly 33KB on a 35-student roster. Same kind of ceiling, and
 * the same reasoning, as MAX_SPAN_DAYS in api/parent/timetable/route.ts.
 *
 * Over the cap the day rows simply stop; `classes` is unaffected. A client that
 * cares reads the coverage off the last row rather than assuming the range.
 */
const MAX_DAY_ROWS = 75;

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

    // Staff gate on user_type, NOT on a classroom enrollment.
    //
    // This route used to require the caller to hold `nexus_enrollments.role =
    // 'teacher'` in this specific classroom. Production has ~30 staff with an
    // Entra identity and 6 teacher enrollments, so roughly 24 of them were 403'd
    // out of a screen they are entitled to. Same gate and same reasoning as
    // /api/timetable/attendance-report, which documents it at length.
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can view the RSVP dashboard' }, { status: 403 });
    }

    // Enrolled students, minus anyone dormant. "No response" is a list a teacher
    // is expected to chase, so a paused student sitting in it permanently is
    // exactly the wrong kind of work to manufacture.
    //
    // Note this is NOT the enrolment lookup above: that one answers "is the
    // caller a teacher here" and must keep its own query, because dormancy is
    // not an access rule. Being away is not the same as not being watched
    // either: an away student stays on this roster and is counted in `on_roll`.
    const { members: students } = await loadClassroomRoster(classroomId, { client: supabase });

    const allStudents: RosterEntry[] = students.map((s) => ({
      id: s.user_id,
      name: s.user?.name || 'Unknown',
      avatar_url: s.user?.avatar_url || null,
      batch_id: s.batch_id,
      // Already in the roster's SELECT, and thrown away here until now. The roll
      // has to be the roll AS OF the date being asked about: a class on the 18th
      // was never a class the student who enrolled on the 20th could attend, and
      // counting them makes an old night look worse than it was.
      enrolled_at: s.enrolled_at ?? null,
    }));
    const studentIds = allStudents.map((s) => s.id);

    if (classId) {
      // The class row, which this branch never used to read at all. Without it
      // there is no date to judge a window against and no batch to gate on, and
      // the class was never checked against the classroom in the query string.
      const { data: cls } = await supabase
        .from('nexus_scheduled_classes')
        .select('id, scheduled_date, batch_id')
        .eq('id', classId)
        .eq('classroom_id', classroomId)
        .maybeSingle();

      if (!cls) {
        return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
      }

      const [byClass, awayWindows] = await Promise.all([
        fetchOptOuts(supabase, [classId]),
        loadAwayWindows(supabase, {
          studentIds,
          from: cls.scheduled_date,
          to: cls.scheduled_date,
        }),
      ]);

      return NextResponse.json(
        buildBreakdown(byClass.get(classId) || [], allStudents, {
          batchIds: batchesFor(cls.batch_id),
          classDate: cls.scheduled_date,
          awayByStudent: groupByStudent(awayWindows),
        }),
      );
    }

    if (start && end) {
      // Unvalidated until now, which only ever produced an empty class list.
      // The day rows walk the calendar rather than the classes, so a malformed
      // bound stops being harmless: eachDayYmd caps and bails, but answering
      // 200 with no days to a question nobody can parse is worse than saying so.
      if (!YMD.test(start) || !YMD.test(end)) {
        return NextResponse.json({ error: 'start and end must be YYYY-MM-DD' }, { status: 400 });
      }

      const { data: classes } = await supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date, start_time, end_time, batch_id, status')
        .eq('classroom_id', classroomId)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true });

      // One query for the whole range rather than one per class, for both the
      // opt-outs and the windows. A six-class week used to cost six round trips
      // to build the same answer, and a month grid would have cost twenty-six.
      //
      // `studentIds` is not an optimisation, it is a correctness bound.
      // loadAwayWindows is unpaged and truncates at PostgREST's 1000-row
      // default; register/route.ts:297-310 pages this same read and spells out
      // the stake, which is that a truncated away read does not render as
      // nothing, it renders as "missed, no reason". This route's range is a
      // month grid, wider than standing's 30 days, so bound the read by roster
      // size rather than by the whole school's window history.
      //
      // It also has to be loadAwayWindows rather than a hand-rolled query:
      // that helper swallows a missing table, and deploy-nexus does not depend
      // on deploy-db-production. A raw query here would 500 the entire calendar
      // in the window between Vercel going live and the migration landing.
      const classIds = (classes || []).map((c: any) => c.id);
      const [byClass, awayWindows] = await Promise.all([
        fetchOptOuts(supabase, classIds),
        loadAwayWindows(supabase, { studentIds, from: start, to: end }),
      ]);
      const awayByStudent = groupByStudent(awayWindows);

      const byId = new Map(allStudents.map((s) => [s.id, s]));
      const declinedIds = new Set<string>();

      const breakdowns: RsvpClassSummary[] = (classes || []).map((cls: any) => {
        const full = buildBreakdown(byClass.get(cls.id) || [], allStudents, {
          batchIds: batchesFor(cls.batch_id),
          classDate: cls.scheduled_date,
          awayByStudent,
        });
        for (const d of full.not_attending) declinedIds.add(d.id);
        return {
          class_id: cls.id,
          title: cls.title,
          scheduled_date: cls.scheduled_date,
          start_time: cls.start_time,
          end_time: cls.end_time,
          batch_id: cls.batch_id,
          status: cls.status,
          summary: full.summary,
          // Ids only. Naming every attending student once per class would repeat
          // the same twenty-odd objects twenty-six times over a month grid, and
          // nothing renders that list anyway. The sheet shows attending as a
          // headline count rather than a roll call, because listing thirty
          // names nobody needs to read buries the four that matter.
          away_ids: full.away.map((a) => a.id),
          declined_ids: full.not_attending.map((d) => d.id),
          // Away students are held out of declined_ids so no count doubles,
          // which would otherwise lose the fact entirely in range mode. This
          // keeps it, so the sheet can say "also stepped out" without the
          // number moving.
          also_declined_ids: full.away.filter((a) => a.also_declined).map((a) => a.id),
          reason_tally: full.reason_tally,
          away_tally: tallyReasons(full.away),
        };
      });

      // ── Per-date rows ──────────────────────────────────────────────────────
      //
      // One row for EVERY date in the range, not just the dates that have a
      // class. That is the whole point of them: the teacher's question is "is
      // Thursday worth running", asked BEFORE the class and its Teams meeting
      // exist, and a shape keyed on classes can never answer it.
      //
      // Free, in the sense that matters here. `allStudents`, `awayByStudent`
      // and the opt-out map are already in hand from the class loop above, so
      // this adds no query and no Vercel invocation: it is one in-memory pass
      // of days x roster, about 2,000 iterations for a 60-day planning range.
      const classesByDate = new Map<string, any[]>();
      for (const cls of classes || []) {
        const list = classesByDate.get(cls.scheduled_date);
        if (list) list.push(cls);
        else classesByDate.set(cls.scheduled_date, [cls]);
      }

      const days: RsvpDaySummary[] = eachDayYmd(start, end, MAX_DAY_ROWS).map((date) => {
        const dayClasses = classesByDate.get(date) || [];

        // The day's roll is the union of its classes' batches. A day with no
        // class, or with any class open to the whole classroom, is the whole
        // roster: nothing has narrowed it. Anything else and the roll is
        // exactly the students some class that day actually invited.
        const batchIds =
          dayClasses.length === 0 || dayClasses.some((c: any) => !c.batch_id)
            ? null
            : new Set<string>(dayClasses.map((c: any) => c.batch_id as string));

        // Declining ANY of the day's classes counts once, for the day. The map
        // buildBreakdown builds is keyed by student, so a student who declined
        // two of the day's three classes collapses to one entry on the way in
        // and cannot be counted twice on the way out.
        const optOuts = dayClasses.flatMap((c: any) => byClass.get(c.id) || []);

        const full = buildBreakdown(optOuts, allStudents, {
          batchIds,
          classDate: date,
          awayByStudent,
        });

        return {
          date,
          summary: full.summary,
          away_ids: full.away.map((a) => a.id),
          declined_ids: full.not_attending.map((d) => d.id),
          also_declined_ids: full.away.filter((a) => a.also_declined).map((a) => a.id),
          reason_tally: full.reason_tally,
          // Why the away students are away, which reason_tally does not carry:
          // it only ever tallies opt-outs. The planner leads with "9 exam
          // clash, 3 family", and on a date with nothing scheduled the away
          // tally is the only reason breakdown there is.
          away_tally: tallyReasons(full.away),
          class_ids: dayClasses.map((c: any) => c.id),
        };
      });

      // Each student named once, at the top. `windows` stays RAW rather than a
      // composed sentence: the sentence has to be read against a class date or a
      // day, which this range cannot know, and away-windows.ts has no imports at
      // all, so coveringWindow and describeWindow run unchanged in the browser.
      // AwayBanner and AwayWindowsSection already do exactly that.
      const away_students: AwayStudentRow[] = [];
      for (const [id, windows] of awayByStudent) {
        const s = byId.get(id);
        if (!s) continue;
        away_students.push({ id: s.id, name: s.name, avatar_url: s.avatar_url, windows });
      }
      away_students.sort((a, b) => a.name.localeCompare(b.name));

      const declined_students: DeclinedStudentRow[] = [...declinedIds]
        .map((id) => byId.get(id))
        .filter((s): s is RosterEntry => !!s)
        .map((s) => ({ id: s.id, name: s.name, avatar_url: s.avatar_url }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const response: RsvpDashboardRangeResponse = {
        range: { start, end },
        classes: breakdowns,
        days,
        roster_total: allStudents.length,
        away_students,
        declined_students,
      };
      return NextResponse.json(response);
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

/**
 * A roster member as this route holds it internally.
 *
 * Deliberately NOT a wider StudentRow. StudentRow is the shape class mode
 * publishes (it is what `attending`, and via `extends` what RsvpAwayStudent and
 * RsvpDeclinedStudent, put on the wire), so quietly adding a field to it would
 * make the published type lie about its role. `enrolled_at` is needed to decide
 * who was on the roll on a given date and for nothing else, so it stays here
 * and is dropped before anything is pushed to a response.
 */
interface RosterEntry extends StudentRow {
  enrolled_at: string | null;
}

/**
 * The expected headcount for one class.
 *
 * `total` is the DENOMINATOR, not the roll: away students leave it. A class
 * reads "18 of 22 expected, 6 away" when 28 are enrolled. Two invariants, both
 * pinned by route.test.ts:
 *   attending + not_attending === total
 *   total + away === on_roll
 *
 * `total` keeping its old name is load-bearing rather than lazy. Four surfaces
 * render the pair attending/total and every one of them stays TRUE under the new
 * meaning without a code change. Renaming it would also silently invert the
 * assertion in timetable-rsvp-default-nexus.spec.ts that attending +
 * not_attending === total, which would then pass with nobody away and fail only
 * once somebody was: a flaky test rather than a red one.
 */
export interface RsvpSummary {
  /** Expected minus declined. The big number. */
  attending: number;
  /** Declined this one class. Never includes anyone already counted away. */
  not_attending: number;
  /** The denominator: on_roll minus away. */
  total: number;
  /** Enrolled, tracked, and in this class's batch. Before away is taken off. */
  on_roll: number;
  /** Covered by a live declared window on THIS class's date. */
  away: number;
}

export interface RsvpAwayStudent extends StudentRow {
  starts_on: string;
  /** Null means open ended: they do not know when they are back. */
  ends_on: string | null;
  reason_code: string | null;
  /**
   * "Away 3 Oct to 20 Oct: exam clash". Composed against the CLASS date, not
   * today, so a class reviewed in December still reads "Away until 20 Oct".
   * Same rule and same composition as class-insights/route.ts.
   */
  away_window: string;
  /** They ALSO declined this one class. Held apart so no count doubles. */
  also_declined: boolean;
}

export interface RsvpDeclinedStudent extends StudentRow {
  reason: string | null;
  reason_code: string | null;
  wants_catchup: boolean;
  responded_at: string | null;
}

/** Class mode. Keeps its fat shape; every existing reader still compiles. */
export interface RsvpDashboardClassResponse {
  attending: StudentRow[];
  not_attending: RsvpDeclinedStudent[];
  /** Never overlaps not_attending. */
  away: RsvpAwayStudent[];
  reason_tally: Record<RsvpReasonCode, number>;
  summary: RsvpSummary;
}

export interface RsvpClassSummary {
  class_id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  batch_id: string | null;
  status: string;
  summary: RsvpSummary;
  /** Student ids away on this class's date AND in this class's batch. */
  away_ids: string[];
  /** Student ids who declined this class. Disjoint from away_ids. */
  declined_ids: string[];
  /** Away ids who ALSO declined this class. Counted once, as away. */
  also_declined_ids: string[];
  /** Why the opt-outs opted out. */
  reason_tally: Record<RsvpReasonCode, number>;
  /** Why the away students are away. A different question, a different tally. */
  away_tally: Record<RsvpReasonCode, number>;
}

/**
 * One calendar date, whether or not anything is scheduled on it.
 *
 * The class rows answer "who is coming to this class". This answers "is this
 * day worth running", which is the question asked BEFORE the class exists. On a
 * date with no class `class_ids` is empty, nobody has been asked, and so
 * `summary.not_attending` is structurally 0 and `summary.attending` is just the
 * roll minus whoever declared themselves away. The UI must word that as
 * "available" rather than "expected", or an unasked day reads as a confirmed
 * one.
 *
 * The same two invariants hold here as on a class:
 *   attending + not_attending === total
 *   total + away === on_roll
 */
export interface RsvpDaySummary {
  date: string;
  /** Day level, de-duplicated across the day's classes. */
  summary: RsvpSummary;
  away_ids: string[];
  /** Declined at least ONE of the day's classes. Named once. */
  declined_ids: string[];
  also_declined_ids: string[];
  reason_tally: Record<RsvpReasonCode, number>;
  away_tally: Record<RsvpReasonCode, number>;
  /** Empty when nothing is scheduled that date. */
  class_ids: string[];
}

export interface AwayStudentRow {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Live windows overlapping the range, already in sortWindows order. */
  windows: AwayWindow[];
}

export interface DeclinedStudentRow {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Range mode. Students are named ONCE at the top, not once per class. */
export interface RsvpDashboardRangeResponse {
  range: { start: string; end: string };
  classes: RsvpClassSummary[];
  /** One row per date in the range, scheduled or not. The planner reads these. */
  days: RsvpDaySummary[];
  /** The whole classroom roll, so an unscheduled day has a denominator. */
  roster_total: number;
  /** Every student with a live window overlapping this range. */
  away_students: AwayStudentRow[];
  /** Every student who declined at least one class in this range. */
  declined_students: DeclinedStudentRow[];
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

interface BreakdownContext {
  /**
   * The batches invited. One entry for a class, the union of the day's classes
   * for a day row. Null means the whole classroom.
   *
   * A set rather than a single id because a day can hold two classes for two
   * batches, and the day's roll is then both of them. `batchesFor` below is the
   * only place that union is decided.
   */
  batchIds: Set<string> | null;
  /** The class's own date, YYYY-MM-DD. Away is judged against THIS. */
  classDate: string;
  awayByStudent: Map<string, AwayWindow[]>;
}

/** One class's batch as a set, preserving "no batch means everyone". */
function batchesFor(batchId: string | null): Set<string> | null {
  return batchId ? new Set([batchId]) : null;
}

/**
 * Split the roster into expected, away and opted out.
 *
 * There is deliberately no "no response" bucket. A student with no RSVP row has
 * not failed to respond, they are attending, which is what the default means.
 * The old no_response bucket made every class look half-unanswered and gave
 * teachers a list to chase that should never have existed.
 */
function buildBreakdown(
  optOutRows: any[],
  allStudents: RosterEntry[],
  ctx: BreakdownContext,
): RsvpDashboardClassResponse {
  const optOutById = new Map<string, any>(optOutRows.map((r) => [r.student_id, r]));

  const attending: StudentRow[] = [];
  const notAttending: RsvpDeclinedStudent[] = [];
  const away: RsvpAwayStudent[] = [];
  let onRoll = 0;

  for (const student of allStudents) {
    // A class for one batch is not a class the rest of the classroom was
    // invited to. The test has to be on the CLASS's batches, not the member's:
    // a member with a null batch_id is not in this batch, and testing the
    // member's would short-circuit and let every unbatched member through. Same
    // predicate and same trap as register/route.ts:361-367. Because this is a
    // `continue`, an excluded member is absent from on_roll too, which is what
    // makes "18 of 22" a statement about the students actually invited.
    //
    // A null batch_id can never match a named batch, so it is coerced to a
    // string that no batch id can be rather than being allowed to look up as
    // `undefined`.
    if (ctx.batchIds && !ctx.batchIds.has(student.batch_id ?? '')) continue;

    // Nobody is on the roll for a date before they enrolled. This sits BESIDE
    // the batch gate and above `onRoll++` on purpose: counted first and skipped
    // after, it would leave on_roll larger than total + away and break the
    // invariant on every row.
    //
    // joinedAfterClass rather than a hand-rolled date compare. It measures
    // against an explicitly offset IST end-of-day, matching loadClassroomRoster's
    // `asOf`, so this in-memory test and the query agree about who was on the
    // roster that day. A missing enrolled_at never excludes anyone: a failed
    // backfill must not silently erase a student from the roll.
    if (joinedAfterClass(student.enrolled_at, ctx.classDate)) continue;

    onRoll++;

    // What leaves this route. RosterEntry is internal; spreading it whole would
    // put enrolled_at on every student in the class-mode response.
    const wire: StudentRow = {
      id: student.id,
      name: student.name,
      avatar_url: student.avatar_url,
      batch_id: student.batch_id,
    };

    // Away outranks the opt-out, the same way it does on the register
    // (attendance-register.ts, registerGroupOf). Someone on declared leave who
    // also tapped "cannot attend" on one class inside it is ONE empty chair;
    // counting them in both buckets would break attending + not_attending ===
    // total. `also_declined` keeps the detail visible in the sheet without
    // letting it into a count, and keeps them out of the reason tally so the
    // chips do not double-count either.
    //
    // Judged against the CLASS date, never today. A class three weeks out has to
    // be measured against its own day, or every future class reads as though the
    // window that covers it started this morning.
    const window = coveringWindow(ctx.awayByStudent.get(student.id) || [], ctx.classDate);
    if (window) {
      away.push({
        ...wire,
        starts_on: window.starts_on,
        ends_on: window.ends_on,
        reason_code: window.reason_code,
        away_window: `${describeWindow(window, ctx.classDate)}: ${describeReason(
          window.reason_code,
          window.reason_note,
        )}`,
        also_declined: optOutById.has(student.id),
      });
      continue;
    }

    const optOut = optOutById.get(student.id);
    if (optOut) {
      notAttending.push({
        ...wire,
        reason: optOut.reason || null,
        reason_code: optOut.reason_code || null,
        wants_catchup: optOut.wants_catchup !== false,
        responded_at: optOut.responded_at,
      });
    } else {
      attending.push({ ...wire });
    }
  }

  return {
    attending,
    not_attending: notAttending,
    away,
    reason_tally: tallyReasons(notAttending),
    summary: {
      attending: attending.length,
      not_attending: notAttending.length,
      total: attending.length + notAttending.length,
      on_roll: onRoll,
      away: away.length,
    },
  };
}
