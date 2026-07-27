// @ts-nocheck — nexus_catchup_journeys and the new nexus_class_absences columns
// are not in the generated Supabase types yet; regenerate with
// pnpm supabase:gen:types once the migration is applied.
//
// Everything in here is plumbing on purpose. Every real decision (what belongs
// in a backlog, what is open, what counts toward pace) lives in
// ../../utils/catchup.ts, which is pure, unit tested, and NOT under @ts-nocheck.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import {
  classifyCatchupCandidate,
  isCatchupItemComplete,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
} from '../../utils/catchup';

const JOURNEYS = 'nexus_catchup_journeys';
const ITEMS = 'nexus_class_absences';

/** A timestamp's calendar day in IST. Classes are Indian evenings; servers are UTC. */
function istDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

/** Today in IST as YYYY-MM-DD. */
export function istTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// ---------------------------------------------------------------------------
// Generating a backlog
// ---------------------------------------------------------------------------

export interface EnsureCatchupJourneyOptions {
  /**
   * Compute and report, write nothing. Local dev points at the PRODUCTION
   * database, and this function inserts a row per past class per student, so
   * there needs to be a way to see what it would do without doing it.
   */
  dryRun?: boolean;
  /**
   * Re-enrolment after a removal: restart the pacing clock from today.
   * enrollUser upserts without resetting `enrolled_at`, so without this a
   * restored student is instantly months "behind" on work they were not here
   * for. Completed items are kept.
   */
  restart?: boolean;
}

export interface EnsureCatchupJourneyResult {
  journey: any | null;
  created: boolean;
  /** New backlog rows written (0 on a re-run: the upsert ignores duplicates). */
  itemsInserted: number;
  /** Past classes considered, whether or not they were already items. */
  candidatesConsidered: number;
  /** Set when no journey was made, so callers can log something useful. */
  skippedReason?: 'not_an_active_student' | 'classroom_missing';
}

/**
 * Make sure a student has a catch-up backlog for every class taught before they
 * joined. Idempotent: safe to call on every enrolment and again from the weekly
 * sweep.
 *
 * A row is created for EVERY past class, including ones with no recording.
 * Whether an item is doable, not yet prepared, or impossible is classified at
 * read time from live data, so a recording uploaded next week revives its item
 * on its own and a teacher unpublishing a recap does not leave a dead link.
 *
 * Callers must not let a failure here fail an enrolment. Getting into a
 * classroom matters more than getting a to-do list.
 */
export async function ensureCatchupJourney(
  studentId: string,
  classroomId: string,
  opts: EnsureCatchupJourneyOptions = {},
  client?: TypedSupabaseClient,
): Promise<EnsureCatchupJourneyResult> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const empty: EnsureCatchupJourneyResult = {
    journey: null,
    created: false,
    itemsInserted: 0,
    candidatesConsidered: 0,
  };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('user_id, classroom_id, batch_id, enrolled_at')
    .eq('user_id', studentId)
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) return { ...empty, skippedReason: 'not_an_active_student' };

  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('id, catchup_weekly_quota')
    .eq('id', classroomId)
    .maybeSingle();
  if (!classroom) return { ...empty, skippedReason: 'classroom_missing' };

  const startedOn = opts.restart
    ? istTodayYmd()
    : istDay(enrollment.enrolled_at || new Date().toISOString());

  // 1. The journey header.
  const { data: existing } = await supabase
    .from(JOURNEYS)
    .select('*')
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId)
    .maybeSingle();

  let journey = existing;
  let created = false;

  if (!existing) {
    created = true;
    if (opts.dryRun) {
      journey = { id: null, student_id: studentId, classroom_id: classroomId, started_on: startedOn };
    } else {
      const { data, error } = await supabase
        .from(JOURNEYS)
        .insert({
          student_id: studentId,
          classroom_id: classroomId,
          started_on: startedOn,
          // Snapshot, not a live read: raising the classroom default must not
          // retroactively put existing students behind pace.
          weekly_quota: classroom.catchup_weekly_quota ?? 2,
        })
        .select()
        .single();
      if (error) throw error;
      journey = data;
    }
  } else if (opts.restart && !opts.dryRun && existing.started_on !== startedOn) {
    const { data } = await supabase
      .from(JOURNEYS)
      .update({ started_on: startedOn, status: 'active', completed_at: null })
      .eq('id', existing.id)
      .select()
      .single();
    journey = data || existing;
  }

  // 2. Every published class taught before they joined.
  let query = supabase
    .from('nexus_scheduled_classes')
    .select('id, scheduled_date, batch_id')
    .eq('classroom_id', classroomId)
    .eq('publish_state', 'published')
    .neq('status', 'cancelled')
    .lt('scheduled_date', startedOn);

  // A batch-scoped class only belongs to students in that batch. A class with
  // no batch is for everyone.
  query = enrollment.batch_id
    ? query.or(`batch_id.is.null,batch_id.eq.${enrollment.batch_id}`)
    : query.is('batch_id', null);

  const { data: classes, error: classErr } = await query;
  if (classErr) throw classErr;

  const candidates = classes || [];
  if (candidates.length === 0) {
    if (!opts.dryRun && journey?.id) {
      await supabase.from(JOURNEYS).update({ generated_at: new Date().toISOString() }).eq('id', journey.id);
    }
    return { journey, created, itemsInserted: 0, candidatesConsidered: 0 };
  }

  if (opts.dryRun) {
    return { journey, created, itemsInserted: candidates.length, candidatesConsidered: candidates.length };
  }

  const classIds = candidates.map((c: any) => c.id);

  // 3. Write the items. ignoreDuplicates so a re-run never clobbers a reason the
  //    student gave, a recording they watched, or a test they passed.
  const { data: inserted, error: insErr } = await supabase
    .from(ITEMS)
    .upsert(
      candidates.map((c: any) => ({
        scheduled_class_id: c.id,
        student_id: studentId,
        classroom_id: classroomId,
        kind: 'late_joiner',
        journey_id: journey.id,
      })),
      { onConflict: 'scheduled_class_id,student_id', ignoreDuplicates: true },
    )
    .select('id');
  if (insErr) throw insErr;

  // 4. Adopt rows that already existed. Two reasons they can: a genuine
  //    opted_out row, and the no_show rows the absence roster used to create for
  //    students who had not joined yet (fixed in class-absences.ts, but the rows
  //    it already wrote are still out there). Narrow on purpose: this sets the
  //    journey link and nothing else.
  await supabase
    .from(ITEMS)
    .update({ journey_id: journey.id })
    .eq('student_id', studentId)
    .in('scheduled_class_id', classIds)
    .is('journey_id', null);

  // A class taught before the student existed here cannot be a no-show. Relabel
  // those, so they stop inflating the teacher's chase list. opted_out rows are
  // left alone: they carry a reason someone actually wrote.
  await supabase
    .from(ITEMS)
    .update({ kind: 'late_joiner' })
    .eq('student_id', studentId)
    .eq('kind', 'no_show')
    .in('scheduled_class_id', classIds);

  await supabase.from(JOURNEYS).update({ generated_at: new Date().toISOString() }).eq('id', journey.id);

  return {
    journey,
    created,
    itemsInserted: (inserted || []).length,
    candidatesConsidered: candidates.length,
  };
}

// ---------------------------------------------------------------------------
// Reading a backlog
// ---------------------------------------------------------------------------

export async function getCatchupJourney(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<any | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data } = await supabase
    .from(JOURNEYS)
    .select('*')
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId)
    .maybeSingle();
  return data || null;
}

export interface CatchupBacklogItem {
  id: string;
  scheduled_class_id: string;
  kind: string;
  status: string;
  step: string;
  position: number | null;
  countsTowardPace: boolean;
  watched: boolean;
  assignments_outstanding: number;
  assignments_total: number;
  has_test: boolean;
  test_unlocked: boolean;
  test_passed: boolean;
  excused: boolean;
  recap_id: string | null;
  caught_up_at: string | null;
  class: {
    id: string;
    title: string | null;
    scheduled_date: string;
    start_time: string | null;
    status: string | null;
    has_recording: boolean;
  };
}

export interface CatchupBacklog {
  journey: any;
  items: CatchupBacklogItem[];
  totals: { total: number; completed: number; blocked: number; pendingTeacher: number };
}

/**
 * A student's whole backlog, resolved: what is done, what is open, what is
 * locked, and what they cannot do anything about.
 *
 * Every read is batched with `.in()` rather than looped per class, because this
 * runs on a student's first paint and again for every student in the weekly
 * pacing sweep.
 */
export async function getCatchupBacklog(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<CatchupBacklog | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const journey = await getCatchupJourney(studentId, classroomId, supabase);
  if (!journey) return null;

  const { data: rows } = await supabase
    .from(ITEMS)
    .select(
      'id, scheduled_class_id, kind, recording_watched_at, caught_up_at, test_unlocked_at, ' +
        'test_passed_at, excused_at, class:nexus_scheduled_classes(id, title, scheduled_date, ' +
        'start_time, status, recording_url, youtube_url)',
    )
    .eq('student_id', studentId)
    .eq('journey_id', journey.id);

  const items = (rows || []).filter((r: any) => r.class);
  if (items.length === 0) {
    return { journey, items: [], totals: { total: 0, completed: 0, blocked: 0, pendingTeacher: 0 } };
  }

  // Chronological. The unlock order is the order the material was taught, so it
  // is derived from the class, never from a stored position that would need
  // renumbering whenever a class is added retroactively.
  items.sort((a: any, b: any) => {
    const d = String(a.class.scheduled_date).localeCompare(String(b.class.scheduled_date));
    if (d !== 0) return d;
    const t = String(a.class.start_time || '').localeCompare(String(b.class.start_time || ''));
    return t !== 0 ? t : String(a.class.id).localeCompare(String(b.class.id));
  });

  const classIds = items.map((i: any) => i.scheduled_class_id);
  const facts = await loadClassFacts(supabase, studentId, classIds);

  const resolved = resolveCatchupBacklog(
    items.map((i: any) => toFacts(i, facts)),
  );

  // Reconcile the stored caught_up_at against what the facts now say.
  //
  // Completion is DERIVED (watched + no assignment outstanding + test passed),
  // but it is also STORED, because other surfaces read the column directly:
  // /api/timetable/my-schedule counts a student's outstanding catch-up with
  // `.is('caught_up_at', null)`, and the teacher attendance screen shows a
  // "caught up" chip from it. Only a graded test attempt used to write it, so a
  // student who passed the test first and submitted the assignment second ended
  // up derived-done but stored-incomplete, and the timetable rail would nag them
  // about a class they had finished.
  //
  // Doing it here rather than hooking every route that can change a fact (two
  // assignment submission paths, a teacher un-submitting, a recording appearing
  // later) keeps one definition of "done". Both directions, so a teacher
  // restoring an excused item or resetting a test takes the stamp away again.
  const toStamp: string[] = [];
  const toClear: string[] = [];
  items.forEach((i: any, idx: number) => {
    const done = resolved[idx].status === 'done';
    if (done && !i.caught_up_at) toStamp.push(i.id);
    else if (!done && i.caught_up_at) toClear.push(i.id);
  });
  if (toStamp.length) {
    const stampedAt = new Date().toISOString();
    await supabase.from(ITEMS).update({ caught_up_at: stampedAt }).in('id', toStamp);
    items.forEach((i: any) => {
      if (toStamp.includes(i.id)) i.caught_up_at = stampedAt;
    });
  }
  if (toClear.length) {
    await supabase.from(ITEMS).update({ caught_up_at: null }).in('id', toClear);
    items.forEach((i: any) => {
      if (toClear.includes(i.id)) i.caught_up_at = null;
    });
  }

  return {
    journey,
    items: items.map((i: any, idx: number) => {
      const r = resolved[idx];
      const recap = facts.recapByClass.get(i.scheduled_class_id) || null;
      const work = facts.assignmentsByClass.get(i.scheduled_class_id) || [];
      return {
        id: i.id,
        scheduled_class_id: i.scheduled_class_id,
        kind: i.kind,
        status: r.status,
        step: r.step,
        position: r.position,
        countsTowardPace: r.countsTowardPace,
        watched: isWatched(i, facts),
        assignments_outstanding: work.filter((a: any) => !facts.submitted.has(a.id)).length,
        assignments_total: work.length,
        has_test: facts.testByClass.has(i.scheduled_class_id),
        test_unlocked: !!i.test_unlocked_at,
        test_passed: !!i.test_passed_at,
        excused: !!i.excused_at,
        recap_id: recap ? recap.id : null,
        caught_up_at: i.caught_up_at,
        class: {
          id: i.class.id,
          title: i.class.title,
          scheduled_date: i.class.scheduled_date,
          start_time: i.class.start_time,
          status: i.class.status,
          has_recording: !!(i.class.recording_url || i.class.youtube_url),
        },
      };
    }),
    totals: summariseCatchupBacklog(resolved),
  };
}

// ---------------------------------------------------------------------------
// The per-class facts both the backlog and the single-class route need
// ---------------------------------------------------------------------------

export interface ClassFacts {
  recapByClass: Map<string, { id: string }>;
  completedRecaps: Set<string>;
  assignmentsByClass: Map<string, { id: string }[]>;
  submitted: Set<string>;
  testByClass: Map<string, { id: string; test_id: string; passing_pct: number | null }>;
}

/**
 * Load, in one batched pass, everything about a set of classes that the catch-up
 * rules need. Assignment completion is derived here rather than stored on the
 * item, exactly as the absence table's own contract requires, so the two can
 * never drift apart.
 */
export async function loadClassFacts(
  supabase: any,
  studentId: string,
  classIds: string[],
): Promise<ClassFacts> {
  const empty: ClassFacts = {
    recapByClass: new Map(),
    completedRecaps: new Set(),
    assignmentsByClass: new Map(),
    submitted: new Set(),
    testByClass: new Map(),
  };
  if (classIds.length === 0) return empty;

  const [{ data: recaps }, { data: assignments }, { data: placements }] = await Promise.all([
    supabase
      .from('nexus_class_recaps')
      .select('id, scheduled_class_id')
      .in('scheduled_class_id', classIds)
      .eq('status', 'published'),
    supabase
      .from('nexus_class_assignments')
      .select('id, scheduled_class_id')
      .in('scheduled_class_id', classIds)
      .eq('status', 'published'),
    supabase
      .from('nexus_test_placements')
      .select('id, test_id, context_id, passing_pct')
      .eq('context_type', 'catchup_class')
      .in('context_id', classIds)
      .eq('is_active', true),
  ]);

  const recapByClass = new Map<string, { id: string }>();
  for (const r of recaps || []) recapByClass.set(r.scheduled_class_id, { id: r.id });

  const assignmentsByClass = new Map<string, { id: string }[]>();
  for (const a of assignments || []) {
    const list = assignmentsByClass.get(a.scheduled_class_id) || [];
    list.push({ id: a.id });
    assignmentsByClass.set(a.scheduled_class_id, list);
  }

  const testByClass = new Map<string, { id: string; test_id: string; passing_pct: number | null }>();
  for (const p of placements || []) {
    testByClass.set(p.context_id, { id: p.id, test_id: p.test_id, passing_pct: p.passing_pct });
  }

  const recapIds = [...recapByClass.values()].map((r) => r.id);
  const assignmentIds = [...assignmentsByClass.values()].flat().map((a) => a.id);

  const [{ data: progress }, { data: docs }, { data: draws }] = await Promise.all([
    recapIds.length
      ? supabase
          .from('nexus_class_recap_progress')
          .select('recap_id')
          .eq('student_id', studentId)
          .eq('status', 'completed')
          .in('recap_id', recapIds)
      : Promise.resolve({ data: [] }),
    assignmentIds.length
      ? supabase
          .from('nexus_assignment_submissions')
          .select('assignment_id')
          .eq('student_id', studentId)
          .in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [] }),
    assignmentIds.length
      ? supabase
          .from('drawing_submissions')
          .select('assignment_id')
          .eq('student_id', studentId)
          .in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    recapByClass,
    completedRecaps: new Set((progress || []).map((p: any) => p.recap_id)),
    assignmentsByClass,
    submitted: new Set([...(docs || []), ...(draws || [])].map((s: any) => s.assignment_id)),
    testByClass,
  };
}

/**
 * Watched means the gated recap is finished. The self-declared timestamp only
 * counts when there is no recap to gate on, which is the legacy absence case:
 * a class with nothing but a raw link, where a checkbox was all we ever had.
 */
export function isWatched(item: any, facts: ClassFacts): boolean {
  const recap = facts.recapByClass.get(item.scheduled_class_id);
  if (recap) return facts.completedRecaps.has(recap.id);
  return !!item.recording_watched_at;
}

/** Turn one item row plus the batched class facts into the pure rules' input. */
export function toFacts(item: any, facts: ClassFacts) {
  const verdict = classifyCatchupCandidate(
    {
      status: item.class?.status ?? null,
      recording_url: item.class?.recording_url ?? null,
      youtube_url: item.class?.youtube_url ?? null,
    },
    facts.recapByClass.has(item.scheduled_class_id)
      ? { id: facts.recapByClass.get(item.scheduled_class_id)!.id, status: 'published' }
      : null,
  );
  const work = facts.assignmentsByClass.get(item.scheduled_class_id) || [];
  return {
    excluded: verdict === 'no_recording',
    notReady: verdict === 'not_ready',
    excused: !!item.excused_at,
    watched: isWatched(item, facts),
    assignmentsOutstanding: work.filter((a) => !facts.submitted.has(a.id)).length,
    hasTest: facts.testByClass.has(item.scheduled_class_id),
    testPassed: !!item.test_passed_at,
  };
}

// ---------------------------------------------------------------------------
// One class, for the per-class catch-up route
// ---------------------------------------------------------------------------

/**
 * Find this student's item for one class, generating their backlog first if
 * they are a late joiner who has not been swept yet.
 *
 * Returns null when there is legitimately nothing to catch up on: the student
 * was already enrolled when the class ran, which makes this the absence loop's
 * business, not the journey's. That is the one case the caller should 404.
 */
export async function ensureCatchupItemForClass(
  studentId: string,
  classId: string,
  client?: TypedSupabaseClient,
): Promise<any | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: existing } = await supabase
    .from(ITEMS)
    .select('*')
    .eq('scheduled_class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (existing) return existing;

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, scheduled_date')
    .eq('id', classId)
    .maybeSingle();
  if (!cls) return null;

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('enrolled_at')
    .eq('user_id', studentId)
    .eq('classroom_id', cls.classroom_id)
    .eq('role', 'student')
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) return null;

  // Enrolled before the class ran, so they either attended or genuinely missed
  // it. Either way the absence cron owns that row, and inventing one here would
  // let anyone conjure a catch-up for a class they sat through.
  const joinedDay = istDay(enrollment.enrolled_at || new Date().toISOString());
  if (joinedDay <= String(cls.scheduled_date).slice(0, 10)) return null;

  await ensureCatchupJourney(studentId, cls.classroom_id, {}, supabase);

  const { data: fresh } = await supabase
    .from(ITEMS)
    .select('*')
    .eq('scheduled_class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  return fresh || null;
}

/**
 * Active journeys for the weekly pacing sweep, oldest-nudged first.
 *
 * Capped and cursored on purpose: every journey costs a batched read of its
 * whole backlog, and this runs against the entire cohort. A run that grows
 * without bound would eventually hit the serverless time budget silently, which
 * is worse than a run that visibly does half the work and says so.
 */
export async function listActiveJourneys(
  opts: { limit?: number; classroomId?: string } = {},
  client?: TypedSupabaseClient,
): Promise<any[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  let query = supabase
    .from(JOURNEYS)
    .select('id, student_id, classroom_id, started_on, weekly_quota, status, last_nudged_at')
    .eq('status', 'active')
    .order('last_nudged_at', { ascending: true, nullsFirst: true })
    .limit(opts.limit ?? 200);
  if (opts.classroomId) query = query.eq('classroom_id', opts.classroomId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Stamp the nudge clock so the same student is not chased twice in a week. */
export async function markJourneyNudged(
  journeyId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  await supabase
    .from(JOURNEYS)
    .update({ last_nudged_at: new Date().toISOString() })
    .eq('id', journeyId);
}

/** Close a journey whose backlog is fully cleared. Idempotent. */
export async function markJourneyCompleted(
  journeyId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  await supabase
    .from(JOURNEYS)
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', journeyId)
    .eq('status', 'active');
}

// ---------------------------------------------------------------------------
// The class test: unlocking, grading side-effects, and re-arming after a fail
// ---------------------------------------------------------------------------
//
// Nothing below imports test-repository. The grader imports THIS module for its
// side-effect, so the dependency runs one way only. The builder that needs both
// lives in catchup-test.ts.

/** Fraction of the recording that must be reached before a retry is allowed. */
const REWATCH_COMPLETION_RATIO = 0.9;

/**
 * Stamp caught_up_at when every gate on a class is finally cleared.
 *
 * Called after the test is passed rather than trusting a button, because for a
 * journey item all three gates are machine checkable. Idempotent.
 */
export async function recomputeCatchupItemCompletion(
  studentId: string,
  classId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: item } = await supabase
    .from(ITEMS)
    .select('*, class:nexus_scheduled_classes(id, status, recording_url, youtube_url)')
    .eq('scheduled_class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (!item || !item.class) return false;
  // toFacts reads item.class off the row, and the embed above supplies it.

  const facts = await loadClassFacts(supabase, studentId, [classId]);
  const complete = isCatchupItemComplete(toFacts(item, facts));

  if (complete && !item.caught_up_at) {
    await supabase
      .from(ITEMS)
      .update({ caught_up_at: new Date().toISOString() })
      .eq('id', item.id);
  } else if (!complete && item.caught_up_at && item.journey_id) {
    // It went backwards. A teacher restoring an item they had excused, or
    // resetting a passed test, un-does the class. Only for journey items: on a
    // classic absence caught_up_at is the student's own declaration and is not
    // ours to withdraw.
    await supabase.from(ITEMS).update({ caught_up_at: null }).eq('id', item.id);
  }
  return complete;
}

/**
 * The side-effect of grading a class test, dispatched from gradeTestOneShot.
 *
 * Runs on a FAIL as well as a pass, which is the part worth being careful about:
 * clearing test_unlocked_at is the entire "you must rewatch before you retry"
 * rule. Doing it here rather than in the route means it holds no matter which
 * caller grades the attempt.
 */
export async function recordCatchupTestAttempt(
  input: { studentId: string; scheduledClassId: string; passed: boolean; percentage: number },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: item } = await supabase
    .from(ITEMS)
    .select('id, test_passed_at')
    .eq('scheduled_class_id', input.scheduledClassId)
    .eq('student_id', input.studentId)
    .maybeSingle();
  // No backlog item means someone sat the class test who does not owe this
  // class. Grading still stands, there is just nothing to unlock.
  if (!item) return;

  if (input.passed) {
    if (!item.test_passed_at) {
      await supabase
        .from(ITEMS)
        .update({ test_passed_at: new Date().toISOString() })
        .eq('id', item.id);
    }
    await recomputeCatchupItemCompletion(input.studentId, input.scheduledClassId, supabase);
    return;
  }

  // Failed. Re-lock. The only way back in is through the recording.
  await supabase.from(ITEMS).update({ test_unlocked_at: null }).eq('id', item.id);

  // Send them back to the start of the recording too.
  //
  // Clearing the unlock on its own is not enough. rearmCatchupTest decides
  // "have they rewatched" from nexus_class_recap_progress, and a failed attempt
  // leaves that row exactly as the FIRST watch left it: status 'completed' and
  // the position at the end. So without this the student can fail, POST /rearm,
  // and be handed the paper again having rewatched nothing. The rule would then
  // live only in the UI, which offers no such button, rather than on the server.
  //
  // Only the position is reset. status stays 'completed' on purpose: the
  // checkpoint quizzes are already passed and making someone re-answer them is
  // a different punishment from the one the rule describes. The player
  // heartbeats the position back up as they watch, so reaching
  // REWATCH_COMPLETION_RATIO again is what re-opens the test.
  const { data: recap } = await supabase
    .from('nexus_class_recaps')
    .select('id')
    .eq('scheduled_class_id', input.scheduledClassId)
    .eq('status', 'published')
    .maybeSingle();
  if (recap?.id) {
    await supabase
      .from('nexus_class_recap_progress')
      .update({ last_video_position_seconds: 0 })
      .eq('student_id', input.studentId)
      .eq('recap_id', recap.id);
  }
}

/**
 * Open the class test once the gated recap is finished.
 *
 * Called from the recap checkpoint route the moment the last checkpoint passes.
 * Never re-opens a test that has already been passed, and never overwrites an
 * unlock that is already standing.
 */
export async function unlockCatchupTestForRecap(
  studentId: string,
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: recap } = await supabase
    .from('nexus_class_recaps')
    .select('id, scheduled_class_id')
    .eq('id', recapId)
    .maybeSingle();
  // An ad-hoc recap has no class, so it can never be a backlog item.
  if (!recap?.scheduled_class_id) return false;

  const { data: item } = await supabase
    .from(ITEMS)
    .select('id, test_unlocked_at, test_passed_at')
    .eq('scheduled_class_id', recap.scheduled_class_id)
    .eq('student_id', studentId)
    .maybeSingle();
  if (!item || item.test_passed_at || item.test_unlocked_at) return false;

  await supabase
    .from(ITEMS)
    .update({ test_unlocked_at: new Date().toISOString() })
    .eq('id', item.id);
  return true;
}

export type RearmOutcome =
  | { ok: true; alreadyPassed?: boolean; rewatchCount?: number }
  | { ok: false; reason: 'no_item' | 'no_recap' | 'not_rewatched' };

/**
 * Re-open the test after a failed attempt, once the student has been back
 * through the recording.
 *
 * The check reads nexus_class_recap_progress on the server rather than trusting
 * the client to say "I finished". That matters here more than anywhere else in
 * the feature: markRecapCompletedIfAllPassed stays true forever once the
 * checkpoints are passed, so recap completion alone cannot tell a rewatch from
 * a page refresh. The watched position can, and it is already heartbeated by
 * the existing progress route.
 */
export async function rearmCatchupTest(
  studentId: string,
  classId: string,
  client?: TypedSupabaseClient,
): Promise<RearmOutcome> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: item } = await supabase
    .from(ITEMS)
    .select('id, test_unlocked_at, test_passed_at, rewatch_count')
    .eq('scheduled_class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (!item) return { ok: false, reason: 'no_item' };
  if (item.test_passed_at) return { ok: true, alreadyPassed: true };

  const { data: recap } = await supabase
    .from('nexus_class_recaps')
    .select('id, video_duration_seconds')
    .eq('scheduled_class_id', classId)
    .eq('status', 'published')
    .maybeSingle();
  if (!recap) return { ok: false, reason: 'no_recap' };

  const { data: progress } = await supabase
    .from('nexus_class_recap_progress')
    .select('status, last_video_position_seconds')
    .eq('student_id', studentId)
    .eq('recap_id', recap.id)
    .maybeSingle();
  if (!progress || progress.status !== 'completed') return { ok: false, reason: 'not_rewatched' };

  // Only enforce a position when the recording's length is known. An unknown
  // duration is a data gap, not a reason to trap someone who did rewatch.
  const duration = Number(recap.video_duration_seconds) || 0;
  if (duration > 0) {
    const reached = Number(progress.last_video_position_seconds) || 0;
    if (reached < duration * REWATCH_COMPLETION_RATIO) return { ok: false, reason: 'not_rewatched' };
  }

  const rewatchCount = (Number(item.rewatch_count) || 0) + 1;
  await supabase
    .from(ITEMS)
    .update({ test_unlocked_at: new Date().toISOString(), rewatch_count: rewatchCount })
    .eq('id', item.id);

  return { ok: true, rewatchCount };
}
