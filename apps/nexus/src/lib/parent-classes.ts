/**
 * Turning classroom rows into what a parent is allowed to see.
 *
 * THE CONTRACT THIS MODULE ENFORCES
 * ---------------------------------
 * A parent sees STATUS, never CONTENT. They learn that a recording exists and
 * whether their child watched it; they never get a way to watch it. They learn
 * that the teacher shared four reference materials; they never get the four
 * links. Parents nudge, students do the work, and a portal that let a parent
 * consume the course would quietly become a second student account.
 *
 * The same rule is already written down one notch weaker at
 * lib/class-prep-server.ts:8-13, for the class-prep gate: stripping belongs at
 * the API boundary, never in the components, because ClassDetailPanel and
 * UpNextHero are shared and a server that hands the teacher a URL and the
 * student null makes both correct with no role branching in the UI.
 *
 * TWO BELTS, BOTH REQUIRED
 * ------------------------
 * 1. PARENT_CLASS_COLS never asks for the forbidden columns. Not `*`, ever.
 *    Resources arrive as a count aggregate, never as rows.
 *
 * 2. toParentClass builds its output property by property, with NO SPREAD. If
 *    someone later widens the select string, belt 1 fails but belt 2 holds.
 *
 * Belt 2 exists because belt 1 is one careless edit away from gone, and the
 * failure is silent: adding `*` to the select would leak recording_url to every
 * parent in the school with no error anywhere. parent-classes.test.ts feeds a
 * fully-populated row of sentinel values through the mapper and fails the build
 * if any of them reaches the output. That test IS the contract.
 */

import {
  getSupabaseAdminClient,
  loadClassFacts,
  isWatched,
  loadClassPrepStates,
} from '@neram/database';
import {
  buildClassAttendanceViews,
  summarise,
  describeAttendance,
  type AbsenceRow,
  type AttendanceRow,
  type ClassAttendanceView,
  type ScheduledClassRow,
} from '@/lib/parent-attendance';
import { CLASS_IMAGES_EMBED, sortClassImages } from '@/lib/class-cover';
import type { ClassScope } from '@/lib/parent-data';
import { istToday } from '@/lib/parent-data';
import type {
  ParentClass,
  ParentClassPhase,
  ParentAssignmentBadge,
  ParentTestBadge,
  ParentCatchupBadge,
  ParentRecordingStatus,
} from '@/lib/parent-view-types';

/**
 * Every column a parent read may request, written out.
 *
 * DELIBERATELY ABSENT, and each for a reason:
 *   recording_url, youtube_url  the recording itself
 *   teams_meeting_url, teams_meeting_join_url, teams_meeting_id,
 *   teams_calendar_event_id, teams_organizer_event_id, teams_meeting_scope,
 *   online_meeting_id           a live door into a class full of children
 *   transcript_url              the full text of the lesson
 *
 * `notes` used to be on that list as "the teacher's private notes". It is not
 * that any more: the Wrap Up panel writes the class's detailed description there
 * and labels it as student-visible, so every value in the column is a lesson
 * recap written to be read. It is still absent from the WINDOW read below (a
 * 30-class month does not need eight paragraphs per class) and present only in
 * PARENT_DETAIL_COLS, next to summary_bullets, which it is the long form of.
 *
 * Reference material is NOT embedded here. It is counted by a separate query
 * (loadResourceCounts) for two reasons. First, an embed makes the whole calendar
 * depend on nexus_class_resources existing: that table arrives in a migration
 * that not every environment has applied yet, and PostgREST answers a missing
 * relationship with an error, so one absent optional feature would turn the
 * entire Classes page into a 500. Second, a separate id-only read cannot carry
 * url, thumb_url or study_file_id even by accident, which an embed one careless
 * edit away from CLASS_RESOURCES_EMBED could.
 */
export const PARENT_CLASS_COLS = [
  'id',
  'classroom_id',
  'batch_id',
  'publish_state',
  'title',
  'description',
  'scheduled_date',
  'start_time',
  'end_time',
  'status',
  // Presence of a recording, as a boolean. Selected because `available` cannot
  // be computed without it, and discarded by the mapper the moment it has been.
  'recording_url',
  'youtube_url',
  'teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url)',
  'topic:nexus_topics(id, title)',
  'course_topic:nexus_course_topics(id, title)',
  'classroom:nexus_classrooms!nexus_scheduled_classes_classroom_id_fkey(id, name, type)',
].join(', ');

/**
 * How many reference materials the teacher attached to each class.
 *
 * Ids only, so there is nothing here that could leak a link even in principle.
 *
 * Fails SOFT: an environment that has not yet applied the nexus_class_resources
 * migration returns an error, and the right answer there is "no badge" rather
 * than "no calendar". This is the one read in the parent portal allowed to
 * swallow its error, because the data is decorative and its absence is
 * indistinguishable to a parent from a teacher who shared nothing.
 */
async function loadResourceCounts(classIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!classIds.length) return counts;

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase.from('nexus_class_resources' as any) as any)
      .select('scheduled_class_id')
      .in('scheduled_class_id', classIds);
    if (error) return counts;
    for (const row of (data || []) as { scheduled_class_id: string }[]) {
      counts.set(row.scheduled_class_id, (counts.get(row.scheduled_class_id) || 0) + 1);
    }
  } catch {
    // Table absent in this environment. Decorative data, so carry on.
  }
  return counts;
}

/** The raw row shape, as loosely typed as the query that produced it. */
export interface RawParentClassRow {
  id: string;
  classroom_id: string;
  batch_id?: string | null;
  title?: string | null;
  description?: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status?: string | null;
  recording_url?: string | null;
  youtube_url?: string | null;
  teacher?: { id: string; name: string | null; avatar_url: string | null } | null;
  topic?: { id: string; title: string | null } | null;
  course_topic?: { id: string; title: string | null } | null;
  classroom?: { id: string; name: string; type: string | null } | null;
  class_resources?: unknown;
  [key: string]: unknown;
}

/** Everything the mapper cannot derive from the row alone. */
export interface ParentClassExtras {
  attendance?: ClassAttendanceView | null;
  recording?: {
    watched: boolean;
    watchedAt: string | null;
    proof: 'recap_completed' | 'self_declared' | null;
  } | null;
  assignments?: ParentAssignmentBadge | null;
  test?: ParentTestBadge | null;
  catchup?: ParentCatchupBadge | null;
  /** How many reference materials, from loadResourceCounts. Count only. */
  resourceCount?: number;
  /** Injectable for tests. Defaults to now. */
  nowMs?: number;
}

/** IST instant for a class's local date plus local time. */
function istMs(date: string, time: string): number {
  return new Date(`${date}T${time}+05:30`).getTime();
}

/**
 * PURE. Where a class sits relative to now.
 *
 * Derived from the clock rather than trusting `status`, which is only written
 * when something actively updates it: a class that ran yesterday and was never
 * synced still says 'scheduled'. ClassDetailPanel derives "past" the same way
 * for exactly this reason, and the two must agree.
 *
 * Vercel runs UTC, so the +05:30 construction is load bearing. Without it a
 * 7pm IST class parses as 7pm UTC and stays "upcoming" for five and a half
 * extra hours.
 */
export function classPhase(
  cls: { scheduled_date: string; start_time: string; end_time: string; status?: string | null },
  nowMs: number = Date.now()
): ParentClassPhase {
  const status = String(cls.status || '');
  if (status === 'cancelled' || status === 'rescheduled') return 'cancelled';

  const start = istMs(cls.scheduled_date, cls.start_time);
  const end = istMs(cls.scheduled_date, cls.end_time);

  // Unparseable times: fall back to the stored status rather than guessing a
  // phase that would render an absence for a class we cannot place in time.
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return status === 'completed' ? 'past' : 'upcoming';
  }

  if (nowMs < start) return 'upcoming';
  if (nowMs <= end) return 'live';
  return 'past';
}

/**
 * PURE. The one place a class row becomes parent-visible.
 *
 * Built property by property on purpose. Do not refactor this into a spread of
 * `row`, and do not add a `...rest`: that is the whole of belt 2.
 */
export function toParentClass(
  row: RawParentClassRow,
  extras: ParentClassExtras = {}
): ParentClass {
  const phase = classPhase(row, extras.nowMs);

  // Computed from the URLs, which then go no further. This local is the only
  // place either column is read, and nothing derived from it carries the value.
  const hasRecording = !!(row.recording_url || row.youtube_url);

  const recording: ParentRecordingStatus = {
    available: hasRecording,
    // null, not false, when there is no catch-up context: the child attended
    // live, so "has not watched the recording" would be a meaningless slight.
    watchedByChild: extras.recording ? extras.recording.watched : null,
    watchedAt: extras.recording?.watchedAt ?? null,
    proof: extras.recording?.proof ?? null,
  };

  return {
    id: row.id,
    title: row.title || 'Class',
    description: row.description ?? null,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    end_time: row.end_time,
    status: row.status ?? null,
    phase,
    teacher: row.teacher
      ? {
          id: row.teacher.id,
          name: row.teacher.name ?? null,
          avatar_url: row.teacher.avatar_url ?? null,
        }
      : null,
    topicTitle: row.course_topic?.title || row.topic?.title || null,
    classroom: row.classroom
      ? {
          id: row.classroom.id,
          name: row.classroom.name,
          type: row.classroom.type ?? null,
        }
      : null,
    recording,
    resources: { count: extras.resourceCount ?? 0 },
    // A class that has not finished cannot have attendance. Returning a view
    // here would let a future class render as "Not recorded", which reads to a
    // parent as a class their child has already failed to attend.
    attendance: phase === 'past' ? (extras.attendance ?? null) : null,
    assignmentBadge: extras.assignments ?? null,
    testBadge: extras.test ?? null,
    catchupBadge: extras.catchup ?? null,
  };
}

// ---------------------------------------------------------------------------
// The window read
// ---------------------------------------------------------------------------

export interface ParentClassWindowResult {
  classes: ParentClass[];
  /** Past, non-cancelled classes only. */
  summary: ReturnType<typeof summarise>;
  attendanceSentence: string;
  markedDates: string[];
  holidays: Record<string, { title: string; description: string | null }>;
  /** Kept so the caller can reuse the ids without re-deriving them. */
  classIds: string[];
  attendanceViews: ClassAttendanceView[];
}

/** Narrow a class query to what this child may see. Mirrors lib/parent-data.ts. */
function applyScope<T>(query: T, scope: ClassScope): T {
  let q = query as any;
  q = q.eq('publish_state', 'published');
  q = scope.batchId
    ? q.or(`batch_id.is.null,batch_id.eq.${scope.batchId}`)
    : q.is('batch_id', null);
  return q as T;
}

/**
 * Every class in [start, end] for the child, with the badges the calendar needs.
 *
 * Cancelled classes are INCLUDED in `classes` and EXCLUDED from `summary`. The
 * old list view dropped them entirely, which is right for an attendance list and
 * wrong for a calendar: a missing Tuesday reads as a bug, whereas a struck
 * through "Cancelled" reads as information. They must never reach `summarise`,
 * or a cancelled class would count as a class the child could have attended.
 *
 * Everything after the class query is batched and set-based, so the cost does
 * not grow with the number of classes in the window.
 */
export async function loadParentClassWindow(
  studentId: string,
  classroomId: string,
  scope: ClassScope,
  start: string,
  end: string
): Promise<ParentClassWindowResult> {
  const supabase = getSupabaseAdminClient();
  const nowMs = Date.now();

  const { data: rawClasses, error: classesError } = await applyScope(
    supabase
      .from('nexus_scheduled_classes')
      .select(PARENT_CLASS_COLS)
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end),
    scope
  )
    .order('scheduled_date', { ascending: false })
    .order('start_time', { ascending: false });

  // Never swallow this. A failed select yields `data: null`, which without a
  // check renders as "no classes this month", indistinguishable from a genuinely
  // empty month. That is the same silent-failure shape as the incident that
  // started the parent portal rebuild: an honest-looking empty screen hiding a
  // real fault. A parent must see an error they can report, not a wrong answer.
  if (classesError) {
    console.error('[parent-classes] class window query failed:', classesError);
    throw new Error('Could not load the classes.');
  }

  const rows = (rawClasses || []) as unknown as RawParentClassRow[];

  if (rows.length === 0) {
    const summary = summarise([]);
    return {
      classes: [],
      summary,
      attendanceSentence: describeAttendance(summary),
      markedDates: [],
      holidays: await loadHolidays(classroomId, start, end),
      classIds: [],
      attendanceViews: [],
    };
  }

  const classIds = rows.map((r) => r.id);

  // Attendance is only meaningful for classes that have finished, and only
  // non-cancelled ones count towards the summary.
  const settled = rows.filter(
    (r) => classPhase(r, nowMs) === 'past'
  ) as unknown as ScheduledClassRow[];
  const settledIds = settled.map((c) => c.id);

  // Each query is wrapped so its result narrows to a plain array before meeting
  // the others. Handing several Supabase builders straight to Promise.all makes
  // TypeScript unify deep generic result types and give up with "type
  // instantiation is excessively deep". Same pattern as lib/parent-data.ts.
  const [measuredRows, mineRows, absenceRows, holidays] = await Promise.all([
    (async (): Promise<{ scheduled_class_id: string }[]> => {
      if (!settledIds.length) return [];
      // Roster-wide, deliberately. One row from ANY student proves the class was
      // synced, which is what lets this child's missing row mean "absent"
      // instead of "unknown". See lib/parent-attendance.ts.
      const { data } = await supabase
        .from('nexus_attendance')
        .select('scheduled_class_id')
        .in('scheduled_class_id', settledIds);
      return (data || []) as { scheduled_class_id: string }[];
    })(),
    (async (): Promise<AttendanceRow[]> => {
      if (!settledIds.length) return [];
      const { data } = await supabase
        .from('nexus_attendance')
        .select(
          'scheduled_class_id, attended, joined_at, left_at, duration_minutes, attendance_intervals'
        )
        .eq('student_id', studentId)
        .in('scheduled_class_id', settledIds);
      return (data || []) as unknown as AttendanceRow[];
    })(),
    (async (): Promise<ParentAbsenceRow[]> => {
      // nexus_class_absences is missing from database.generated.ts, so the
      // chained filters blow the type instantiation depth. Documented pattern,
      // same as lib/parent-data.ts:100-113.
      const { data } = await (supabase.from('nexus_class_absences' as any) as any)
        .select(
          'scheduled_class_id, kind, reason_code, reason_note, reason_source, recording_watched_at, caught_up_at, test_passed_at, excused_at'
        )
        .eq('student_id', studentId)
        .in('scheduled_class_id', classIds);
      return (data || []) as ParentAbsenceRow[];
    })(),
    loadHolidays(classroomId, start, end),
  ]);

  const measuredClassIds = new Set(measuredRows.map((r) => r.scheduled_class_id));
  const attendanceViews = buildClassAttendanceViews(
    settled,
    mineRows,
    measuredClassIds,
    absenceRows as AbsenceRow[]
  );
  const viewByClass = new Map(attendanceViews.map((v) => [v.classId, v]));
  const absenceByClass = new Map(absenceRows.map((a) => [a.scheduled_class_id, a]));

  const [badges, resourceCounts] = await Promise.all([
    loadClassBadges(studentId, classIds, absenceByClass),
    loadResourceCounts(classIds),
  ]);

  const classes = rows.map((row) =>
    toParentClass(row, {
      nowMs,
      attendance: viewByClass.get(row.id) ?? null,
      recording: badges.recording.get(row.id) ?? null,
      assignments: badges.assignments.get(row.id) ?? null,
      test: badges.tests.get(row.id) ?? null,
      catchup: badges.catchup.get(row.id) ?? null,
      resourceCount: resourceCounts.get(row.id) ?? 0,
    })
  );

  // A cancelled class was never a chance to attend, so it must not dilute the
  // rate. classPhase already returns 'cancelled' for those, so filtering on the
  // phase keeps this in step with what the UI renders.
  const countable = classes.filter((c) => c.phase === 'past').map((c) => c.id);
  const countableSet = new Set(countable);
  const summary = summarise(attendanceViews.filter((v) => countableSet.has(v.classId)));

  return {
    classes,
    summary,
    attendanceSentence: describeAttendance(summary),
    markedDates: Array.from(new Set(rows.map((r) => r.scheduled_date))).sort(),
    holidays,
    classIds,
    attendanceViews,
  };
}

/** The nexus_class_absences columns the parent surfaces read. */
export interface ParentAbsenceRow {
  scheduled_class_id: string;
  kind?: string | null;
  reason_code?: string | null;
  reason_note?: string | null;
  reason_source?: string | null;
  recording_watched_at?: string | null;
  caught_up_at?: string | null;
  test_passed_at?: string | null;
  excused_at?: string | null;
}

async function loadHolidays(
  classroomId: string,
  start: string,
  end: string
): Promise<Record<string, { title: string; description: string | null }>> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('nexus_classroom_holidays')
    .select('holiday_date, title, description')
    .eq('classroom_id', classroomId)
    .gte('holiday_date', start)
    .lte('holiday_date', end);

  const out: Record<string, { title: string; description: string | null }> = {};
  for (const h of (data || []) as any[]) {
    out[h.holiday_date] = { title: h.title, description: h.description ?? null };
  }
  return out;
}

/**
 * The per-class badges, in two batched queries regardless of class count.
 *
 * Reuses loadClassFacts from the catch-up module rather than re-querying: it
 * already batches published recaps, published assignments, catch-up placements,
 * completed recaps and the submitted set across BOTH the document and drawing
 * submission tables. Rebuilding any of that here would be a second definition of
 * "did this student do the work", and the two would drift.
 *
 * The test badge comes from nexus_class_prep_state, which already materialises
 * test_best_pct, test_attempts and test_passed_at per student per class. The
 * migration that added it (20260801092100) names the parent report as an
 * intended consumer. Deriving the same numbers from nexus_test_attempts here
 * would mean re-implementing "which attempts count", including the trap that
 * abandoned attempts leave stale in_progress rows.
 */
async function loadClassBadges(
  studentId: string,
  classIds: string[],
  absenceByClass: Map<string, ParentAbsenceRow>
): Promise<{
  recording: Map<string, NonNullable<ParentClassExtras['recording']>>;
  assignments: Map<string, ParentAssignmentBadge>;
  tests: Map<string, ParentTestBadge>;
  catchup: Map<string, ParentCatchupBadge>;
}> {
  const recording = new Map<string, NonNullable<ParentClassExtras['recording']>>();
  const assignments = new Map<string, ParentAssignmentBadge>();
  const tests = new Map<string, ParentTestBadge>();
  const catchup = new Map<string, ParentCatchupBadge>();

  if (!classIds.length) return { recording, assignments, tests, catchup };

  const supabase = getSupabaseAdminClient();
  const [facts, prepStates] = await Promise.all([
    loadClassFacts(supabase, studentId, classIds),
    loadClassPrepStates(studentId, classIds, supabase),
  ]);

  for (const classId of classIds) {
    const work = facts.assignmentsByClass.get(classId) || [];
    if (work.length) {
      assignments.set(classId, {
        total: work.length,
        doneByChild: work.filter((a: { id: string }) => facts.submitted.has(a.id)).length,
      });
    }

    const prep = prepStates.get(classId);
    if (prep && (prep.test_attempts || prep.test_best_pct !== null)) {
      const attempts = prep.test_attempts ?? 0;
      const bestPct =
        typeof prep.test_best_pct === 'number' ? Number(prep.test_best_pct) : null;
      tests.set(classId, {
        attempted: attempts > 0,
        // null, never 0, when never attempted: "scored 0%" and "has not sat it"
        // are different messages and a number cannot tell them apart.
        bestPct: attempts > 0 ? bestPct : null,
        passed: attempts > 0 ? !!prep.test_passed_at : null,
      });
    }

    // Only a class the child actually has to catch up on carries a watched
    // state. For a class they attended, recording.watchedByChild stays null.
    const absence = absenceByClass.get(classId);
    if (absence) {
      const recap = facts.recapByClass.get(classId);
      // isWatched keys off scheduled_class_id, and the absence row's own column
      // is the id, so pass it through under the name the helper expects.
      const watched = isWatched({ ...absence, scheduled_class_id: classId }, facts);
      recording.set(classId, {
        watched,
        watchedAt: absence.recording_watched_at ?? null,
        proof: recap ? 'recap_completed' : absence.recording_watched_at ? 'self_declared' : null,
      });

      const outstanding = work.filter((a: { id: string }) => !facts.submitted.has(a.id)).length;
      // Mirrors isCatchupItemComplete: watched, nothing outstanding, and the
      // test passed where a REQUIRED one exists. Derived rather than trusting
      // caught_up_at alone, because that column is only ever written when the
      // student presses the button, so a child who has finished everything but
      // not pressed it should not read as still behind.
      //
      // The two test kinds keep their pass in different places: the catch-up
      // paper stamps test_passed_at on this absence row, a teacher-set class
      // test is graded by the ordinary engine and derived from the attempts.
      const test = facts.testByClass.get(classId) ?? null;
      const testCleared =
        !test ||
        test.required === false ||
        (test.source === 'class_test' ? test.passed : !!absence.test_passed_at);
      const finished = watched && outstanding === 0 && testCleared;
      catchup.set(classId, {
        open: !absence.caught_up_at && !absence.excused_at && !finished,
        caughtUpAt: absence.caught_up_at ?? null,
      });
    }
  }

  return { recording, assignments, tests, catchup };
}

// ---------------------------------------------------------------------------
// One class, in full
// ---------------------------------------------------------------------------

/**
 * The columns the detail read adds on top of PARENT_CLASS_COLS.
 *
 * `summary_bullets` is the AI brief of what actually happened in the room, and
 * `nexus_class_images` is the gallery of what was drawn on the board. Both are a
 * record of the session rather than instructional material, which is why they
 * are here and the recording is not: a parent asked to know what was covered,
 * not to sit the class.
 *
 * Deliberately NOT in the window read. A 30-class month with galleries triples
 * the payload for data that is only ever looked at one class at a time.
 *
 * The images embed MUST come from CLASS_IMAGES_EMBED rather than being written
 * out here. There are two foreign keys between these tables (the gallery's
 * scheduled_class_id, and the class's own cover_image_id pointing back), so an
 * unqualified embed is ambiguous and PostgREST fails the WHOLE query with
 * PGRST201 rather than just dropping the pictures. That constant carries the
 * constraint name and the explanation.
 */
const PARENT_DETAIL_COLS = [
  PARENT_CLASS_COLS,
  'summary_bullets',
  'notes',
  CLASS_IMAGES_EMBED,
].join(', ');

export interface ParentClassDetailData {
  cls: ParentClass;
  whatHappened: {
    /** The teacher's full written account of the class. Empty when unwritten. */
    note: string;
    bullets: string[];
    tags: { id: string; label: string }[];
    imageCount: number;
    images: Array<{
      id: string;
      url: string;
      thumb_url: string | null;
      caption: string | null;
    }>;
  };
  /** The raw absence row, for the caller's catch-up derivation. */
  absence: ParentAbsenceRow | null;
  /** Published assignment ids on this class, for the caller's aggregate. */
  assignmentIds: string[];
}

/**
 * One class, gated twice.
 *
 * resolveChildContext proves WHICH CHILD the caller may ask about. It does not
 * prove that this class belongs to that child's classroom, so the caller must
 * pass the resolved classroomId and scope and this function checks them. Returns
 * null for every failure mode, and the route turns that into one indistinct 404,
 * so a parent cannot probe for class ids belonging to other classrooms.
 */
export async function loadParentClassDetail(
  studentId: string,
  classroomId: string,
  scope: ClassScope,
  classId: string
): Promise<ParentClassDetailData | null> {
  const supabase = getSupabaseAdminClient();
  const nowMs = Date.now();

  const { data: raw, error: classError } = await supabase
    .from('nexus_scheduled_classes')
    .select(PARENT_DETAIL_COLS)
    .eq('id', classId)
    .maybeSingle();

  // Distinguish "not allowed / not there" from "the query broke". Returning null
  // for a broken query would render a real class as a 404 and send a parent to
  // support with an unreproducible complaint, which is exactly how the original
  // incident went.
  if (classError) {
    console.error('[parent-classes] class detail query failed:', classError);
    throw new Error('Could not load the class.');
  }

  const row = raw as unknown as (RawParentClassRow & { [k: string]: unknown }) | null;
  if (!row) return null;

  // Gate two. Every check collapses to the same null so none of them can be
  // told apart from the outside.
  if (row.classroom_id !== classroomId) return null;
  if ((row as any).publish_state !== 'published') return null;
  // A batch-specific class belongs to this child only if it is their batch. A
  // classroom-wide class (batch_id null) belongs to everyone in the classroom.
  const batchId = (row.batch_id ?? null) as string | null;
  if (batchId && batchId !== scope.batchId) return null;

  const phase = classPhase(row, nowMs);
  const settled = phase === 'past';

  const [measuredRows, mineRows, absenceRows, tagRows] = await Promise.all([
    (async (): Promise<{ scheduled_class_id: string }[]> => {
      if (!settled) return [];
      const { data } = await supabase
        .from('nexus_attendance')
        .select('scheduled_class_id')
        .eq('scheduled_class_id', classId);
      return (data || []) as { scheduled_class_id: string }[];
    })(),
    (async (): Promise<AttendanceRow[]> => {
      if (!settled) return [];
      const { data } = await supabase
        .from('nexus_attendance')
        .select(
          'scheduled_class_id, attended, joined_at, left_at, duration_minutes, attendance_intervals'
        )
        .eq('student_id', studentId)
        .eq('scheduled_class_id', classId);
      return (data || []) as unknown as AttendanceRow[];
    })(),
    (async (): Promise<ParentAbsenceRow[]> => {
      const { data } = await (supabase.from('nexus_class_absences' as any) as any)
        .select(
          'scheduled_class_id, kind, reason_code, reason_note, reason_source, recording_watched_at, caught_up_at, test_passed_at, excused_at'
        )
        .eq('student_id', studentId)
        .eq('scheduled_class_id', classId);
      return (data || []) as ParentAbsenceRow[];
    })(),
    (async (): Promise<{ id: string; label: string }[]> => {
      // nexus_class_tags is absent from database.generated.ts, same type-gen gap
      // as nexus_class_absences. Documented `as any` pattern, see parent-data.ts.
      const { data } = await (supabase.from('nexus_class_tags' as any) as any)
        .select('tag:nexus_qb_tags(id, label)')
        .eq('scheduled_class_id', classId);
      return ((data || []) as any[])
        .map((r) => r.tag)
        .filter(Boolean)
        .map((t: any) => ({ id: t.id, label: t.label }));
    })(),
  ]);

  const absence = absenceRows[0] ?? null;
  const absenceByClass = new Map<string, ParentAbsenceRow>();
  if (absence) absenceByClass.set(classId, absence);

  const [badges, resourceCounts] = await Promise.all([
    loadClassBadges(studentId, [classId], absenceByClass),
    loadResourceCounts([classId]),
  ]);

  const attendanceViews = settled
    ? buildClassAttendanceViews(
        [row as unknown as ScheduledClassRow],
        mineRows,
        new Set(measuredRows.map((r) => r.scheduled_class_id)),
        absenceRows as AbsenceRow[]
      )
    : [];

  const cls = toParentClass(row, {
    nowMs,
    attendance: attendanceViews[0] ?? null,
    recording: badges.recording.get(classId) ?? null,
    assignments: badges.assignments.get(classId) ?? null,
    test: badges.tests.get(classId) ?? null,
    catchup: badges.catchup.get(classId) ?? null,
    resourceCount: resourceCounts.get(classId) ?? 0,
  });

  const rawImages = Array.isArray((row as any).class_images)
    ? ((row as any).class_images as any[])
    : [];
  // sortClassImages rather than a local sort: the embed cannot carry .order()
  // without risking a 400, so ordering is the caller's job and there is already
  // one implementation of it.
  const images = sortClassImages(rawImages)
    .map((img) => ({
      id: img.id,
      url: img.url,
      thumb_url: img.thumb_url ?? null,
      caption: img.caption ?? null,
    }));

  const bullets = Array.isArray((row as any).summary_bullets)
    ? ((row as any).summary_bullets as unknown[])
        .map((b) => (typeof b === 'string' ? b : String(b ?? '')))
        .filter(Boolean)
    : [];

  // The assignment ids come from loadClassFacts, which already filtered to
  // published. Re-querying here would be a second definition of "which work
  // counts" and the two would drift.
  const facts = await loadClassFacts(supabase, studentId, [classId]);
  const assignmentIds = (facts.assignmentsByClass.get(classId) || []).map(
    (a: { id: string }) => a.id
  );

  return {
    cls,
    whatHappened: {
      note: typeof (row as any).notes === 'string' ? (row as any).notes.trim() : '',
      bullets,
      tags: tagRows,
      imageCount: images.length,
      images,
    },
    absence,
    assignmentIds,
  };
}

/** Today in IST, re-exported so callers do not reach into parent-data for it. */
export { istToday };
