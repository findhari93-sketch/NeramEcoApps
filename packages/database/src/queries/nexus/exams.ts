/**
 * Scheduled exams: a paper, a classroom, a window, and a published result.
 *
 * HOW THIS DIFFERS FROM class-test.ts, and the difference is the whole point:
 *
 *   1. THE DEADLINE IS HARD, and it lives in the placement's available_until.
 *      class-test.ts documents at length that a deadline must NEVER go there,
 *      because a required piece of homework whose link 403s is worse than a
 *      late submission. An exam is the one deliberate exception. It is not
 *      homework. The door closes, a no-show is ABSENT rather than overdue, and
 *      the student surfaces must SHAPE a closed exam as "Missed" rather than
 *      letting the generic reader present it as an expired link. See shapeExam()
 *      in api/student/tests/overview/route.ts, which does exactly that.
 *
 *   2. ONE ATTEMPT, via gating.attempt_limit, which startOrResumeAttempt
 *      already enforces verbatim.
 *
 *   3. A PER-STUDENT SECOND DOOR. Genuine absentees get an audited makeup
 *      window in nexus_exam_makeups. resolveExamWindowForStudent() is the only
 *      function that decides which window applies, and the attempt route must
 *      consult it BEFORE its generic available_until check, or a makeup student
 *      is refused by the shared placement before their own window is even read.
 *
 * WINDOW OWNERSHIP: nexus_exams.opens_at/closes_at is the source of truth. The
 * placement window and the scheduled class's date and times are mirrors, and
 * syncExamWindow() is their only writer, so the three cannot drift.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { createPlacement } from './test-repository';
import { linkExamToClasses } from './exam-eligibility';

// The generated Supabase types do not know these tables until
// `pnpm supabase:gen:types` is run against a database the exam migrations
// have reached. Casting the NAMES keeps the cast to one line each and
// leaves the rest of this module genuinely type-checked, rather than
// reaching for the @ts-nocheck the older query modules use.
const EXAMS = 'nexus_exams' as any;
const MAKEUPS = 'nexus_exam_makeups' as any;
const RESULTS = 'nexus_exam_results' as any;
const CLASSES = 'nexus_scheduled_classes' as any;
const PLACEMENTS = 'nexus_test_placements' as any;
const ATTEMPTS = 'nexus_test_attempts' as any;
const OVERRIDES = 'nexus_exam_attempt_overrides' as any;

const CONTEXT = 'exam';

/** One attempt. An exam is sat once. */
export const EXAM_ATTEMPT_LIMIT = 1;
export const EXAM_DEFAULT_PASSING_PCT = 40;

export type ExamResultsState = 'unpublished' | 'provisional' | 'final';

/**
 * ranked: a formal exam with rank + results-publish flow (every pre-existing
 * row, and the default for every caller that does not opt in otherwise).
 * practice: a scored but unranked class test -- results_state/rank publishing
 * stay unused for it. See 20260901090100_nexus_scheduled_test_practice_proctoring.
 */
export type ExamMode = 'ranked' | 'practice';

export interface NexusExam {
  id: string;
  scheduled_class_id: string;
  series_id: string;
  classroom_id: string;
  test_id: string;
  title: string | null;
  opens_at: string;
  closes_at: string;
  duration_minutes: number | null;
  passing_pct: number | null;
  results_state: ExamResultsState;
  results_published_at: string | null;
  results_published_by: string | null;
  teams_results_message_id: string | null;
  teams_results_posted_at: string | null;
  mode: ExamMode;
  proctoring_enabled: boolean;
  violation_limit: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamAttemptOverride {
  id: string;
  exam_id: string;
  student_id: string;
  extra_attempts: number;
  granted_by: string | null;
  granted_at: string;
}

/**
 * teacher_grant (default, every pre-existing row): a staff member opened this
 * window from the invigilation roster. self_serve_new_joiner: the student
 * picked their own date because they enrolled after the exam's covered
 * class(es) -- no teacher approval needed for that bucket.
 */
export type ExamMakeupSource = 'teacher_grant' | 'self_serve_new_joiner';

export interface ExamMakeup {
  id: string;
  exam_id: string;
  student_id: string;
  opens_at: string;
  closes_at: string;
  reason: string | null;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  source: ExamMakeupSource;
}

/** IST wall clock from a timestamptz, for writing the timetable mirror. */
function splitLocalDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  // The timetable stores a date and a wall-clock time, so the instant has to be
  // rendered in the timezone the school actually runs in. Everything else in
  // this codebase assumes IST for scheduled_date/start_time.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:00`,
  };
}

/* ────────────────────────────── Reads ─────────────────────────────────── */

export async function getExam(examId: string, client?: TypedSupabaseClient): Promise<NexusExam | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(EXAMS).select('*').eq('id', examId).maybeSingle();
  if (error) throw error;
  return (data as unknown as NexusExam) || null;
}

export async function getExamByClass(
  scheduledClassId: string,
  client?: TypedSupabaseClient,
): Promise<NexusExam | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(EXAMS)
    .select('*')
    .eq('scheduled_class_id', scheduledClassId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as NexusExam) || null;
}

/** Every classroom's sitting of the same exam, for the cross-classroom view. */
export async function listExamsForSeries(
  seriesId: string,
  client?: TypedSupabaseClient,
): Promise<NexusExam[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(EXAMS)
    .select('*')
    .eq('series_id', seriesId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as NexusExam[];
}

export async function listExamsForClassroom(
  classroomId: string,
  opts?: { limit?: number },
  client?: TypedSupabaseClient,
): Promise<NexusExam[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(EXAMS)
    .select('*')
    .eq('classroom_id', classroomId)
    .order('opens_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) throw error;
  return (data || []) as unknown as NexusExam[];
}

/** The exam placement for a test, if it has one. */
export async function getExamPlacement(examId: string, client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const exam = await getExam(examId, supabase);
  if (!exam) return null;
  const { data } = await supabase
    .from(PLACEMENTS)
    .select('*')
    .eq('context_type', CONTEXT)
    .eq('context_id', exam.scheduled_class_id)
    .eq('is_active', true)
    .maybeSingle();
  return data || null;
}

/* ─────────────────────────── The window ───────────────────────────────── */

export interface ResolvedExamWindow {
  opens_at: string;
  closes_at: string;
  /** True when this student is sitting inside a granted makeup rather than the main window. */
  is_makeup: boolean;
}

/**
 * Which window applies to one student.
 *
 * A live makeup grant REPLACES the main window rather than extending it, so a
 * student given a makeup for Thursday cannot also sit it on Tuesday and then
 * again on Thursday. A revoked grant is ignored entirely.
 *
 * The attempt route must call this BEFORE its generic available_until check.
 * That ordering is the easiest thing in this feature to get wrong: the shared
 * placement closes at the main closes_at, so checking it first refuses every
 * makeup student before their own window is ever consulted.
 */
export function resolveExamWindowForStudent(
  exam: { opens_at: string; closes_at: string },
  makeup: ExamMakeup | null | undefined,
): ResolvedExamWindow {
  if (makeup && !makeup.revoked_at) {
    return { opens_at: makeup.opens_at, closes_at: makeup.closes_at, is_makeup: true };
  }
  return { opens_at: exam.opens_at, closes_at: exam.closes_at, is_makeup: false };
}

export async function getExamMakeup(
  examId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<ExamMakeup | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(MAKEUPS)
    .select('*')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ExamMakeup) || null;
}

export async function listExamMakeups(
  examId: string,
  client?: TypedSupabaseClient,
): Promise<ExamMakeup[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(MAKEUPS).select('*').eq('exam_id', examId);
  if (error) throw error;
  return (data || []) as unknown as ExamMakeup[];
}

export async function grantExamMakeup(
  input: {
    examId: string;
    studentId: string;
    opensAt: string;
    closesAt: string;
    reason?: string | null;
    grantedBy?: string | null;
    /** Defaults to 'teacher_grant', byte-identical to every pre-existing caller. */
    source?: ExamMakeupSource;
  },
  client?: TypedSupabaseClient,
): Promise<ExamMakeup> {
  const supabase = client || getSupabaseAdminClient();
  if (new Date(input.closesAt) <= new Date(input.opensAt)) {
    throw new Error('A makeup window has to close after it opens');
  }

  // Upsert rather than insert: re-granting after a revoke is the common case,
  // and UNIQUE(exam_id, student_id) would 23505 on a plain insert.
  const { data, error } = await supabase
    .from(MAKEUPS)
    .upsert(
      {
        exam_id: input.examId,
        student_id: input.studentId,
        opens_at: input.opensAt,
        closes_at: input.closesAt,
        reason: input.reason ?? null,
        granted_by: input.grantedBy ?? null,
        granted_at: new Date().toISOString(),
        revoked_at: null,
        source: input.source ?? 'teacher_grant',
      },
      { onConflict: 'exam_id,student_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as ExamMakeup;
}

export async function revokeExamMakeup(
  examId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(MAKEUPS)
    .update({ revoked_at: new Date().toISOString() })
    .eq('exam_id', examId)
    .eq('student_id', studentId);
  if (error) throw error;
}

/**
 * A teacher-granted +1 (or more) attempt for one student on one exam, on top
 * of the placement's own gating.attempt_limit. Read-then-upsert rather than an
 * atomic increment: supabase-js cannot express `col = col + 1` in an upsert,
 * and a single teacher click has low enough concurrency that this is fine.
 */
export async function grantExamAttemptOverride(
  examId: string,
  studentId: string,
  grantedBy: string | null,
  client?: TypedSupabaseClient,
): Promise<ExamAttemptOverride> {
  const supabase = client || getSupabaseAdminClient();
  const existing = await getExamAttemptOverride(examId, studentId, supabase);
  const { data, error } = await supabase
    .from(OVERRIDES)
    .upsert(
      {
        exam_id: examId,
        student_id: studentId,
        extra_attempts: (existing?.extra_attempts ?? 0) + 1,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
      },
      { onConflict: 'exam_id,student_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as ExamAttemptOverride;
}

export async function getExamAttemptOverride(
  examId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<ExamAttemptOverride | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(OVERRIDES)
    .select('*')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ExamAttemptOverride) || null;
}

/** Every override on one exam, batched for the invigilation roster. */
export async function getExamAttemptOverrides(
  examId: string,
  client?: TypedSupabaseClient,
): Promise<Map<string, number>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(OVERRIDES).select('student_id, extra_attempts').eq('exam_id', examId);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data || []) as any[]) map.set(row.student_id, row.extra_attempts);
  return map;
}

/**
 * Rewrite the two mirrors of the exam window.
 *
 * The ONLY writer of the placement window and the scheduled class's date and
 * times. Everything else reads. That is what keeps three representations of one
 * fact from drifting.
 *
 * The placement carries the hard close in available_until, which is the
 * documented exception described at the top of this file.
 */
export async function syncExamWindow(examId: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const exam = await getExam(examId, supabase);
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  const opens = splitLocalDateTime(exam.opens_at);
  const closes = splitLocalDateTime(exam.closes_at);

  const { error: classErr } = await supabase
    .from(CLASSES)
    .update({
      scheduled_date: opens.date,
      start_time: opens.time,
      end_time: closes.time,
    })
    .eq('id', exam.scheduled_class_id);
  if (classErr) throw classErr;

  const { error: placementErr } = await supabase
    .from(PLACEMENTS)
    .update({
      available_from: exam.opens_at,
      available_until: exam.closes_at,
      passing_pct: exam.passing_pct,
    })
    .eq('context_type', CONTEXT)
    .eq('context_id', exam.scheduled_class_id)
    .eq('is_active', true);
  if (placementErr) throw placementErr;
}

/* ───────────────────────── Student view ───────────────────────────────── */

export interface NexusStudentExamView {
  exam_id: string;
  scheduled_class_id: string;
  test_id: string;
  title: string | null;
  /** The window that actually applies to THIS student: the main window, or a
   * live makeup grant in its place. */
  opens_at: string;
  closes_at: string;
  is_makeup: boolean;
  duration_minutes: number | null;
  passing_pct: number | null;
  results_state: ExamResultsState;
  attempted: boolean;
  attempt_id: string | null;
  /** Null until results_state moves off 'unpublished'. */
  result: {
    rank: number | null;
    /** Count of non-absent candidates, for rendering "Rank 3 of 42". */
    total_ranked: number;
    score: number | null;
    total_marks: number | null;
    percentage: number | null;
    is_provisional: boolean;
    absent: boolean;
  } | null;
}

/**
 * One student's view of every exam their classroom has had: the window that
 * actually applies to them (makeup-aware), whether they have sat it, and
 * their published result once results_state has moved off 'unpublished'.
 *
 * Unlike getExamResults (the teacher's cohort-wide roster), this never exposes
 * another student's row, only the count needed for "Rank 3 of 42".
 *
 * Every lookup is batched across the classroom's exams in ONE query each,
 * never one query per exam, because this runs on every Class Tests tab load.
 */
export async function listStudentExams(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudentExamView[]> {
  const supabase = client || getSupabaseAdminClient();
  const exams = await listExamsForClassroom(classroomId, undefined, supabase);
  if (exams.length === 0) return [];

  const examIds = exams.map((e) => e.id);
  const testIds = [...new Set(exams.map((e) => e.test_id))];

  const makeupMap = new Map<string, ExamMakeup>();
  {
    const { data, error } = await supabase.from(MAKEUPS).select('*').in('exam_id', examIds).eq('student_id', studentId);
    if (error) throw error;
    for (const m of (data || []) as any[]) makeupMap.set(m.exam_id, m as ExamMakeup);
  }

  const attemptByTest = new Map<string, { id: string }>();
  {
    const { data, error } = await supabase
      .from(ATTEMPTS)
      .select('id, test_id')
      .eq('student_id', studentId)
      .eq('status', 'submitted')
      .eq('mode', 'official')
      .in('test_id', testIds);
    if (error) throw error;
    for (const a of (data || []) as any[]) attemptByTest.set(a.test_id, { id: a.id });
  }

  const publishedExamIds = exams.filter((e) => e.results_state !== 'unpublished').map((e) => e.id);
  const resultsByExam = new Map<string, ExamResultRow[]>();
  if (publishedExamIds.length > 0) {
    const { data, error } = await supabase
      .from(RESULTS)
      .select('exam_id, student_id, rank, score, total_marks, percentage, is_provisional, absent')
      .in('exam_id', publishedExamIds);
    if (error) throw error;
    for (const raw of (data || []) as any[]) {
      const r = raw as ExamResultRow;
      const list = resultsByExam.get(r.exam_id) || [];
      list.push(r);
      resultsByExam.set(r.exam_id, list);
    }
  }

  return exams.map((exam) => {
    const window = resolveExamWindowForStudent(exam, makeupMap.get(exam.id) || null);
    const attempt = attemptByTest.get(exam.test_id) || null;

    let result: NexusStudentExamView['result'] = null;
    if (exam.results_state !== 'unpublished') {
      const rows = resultsByExam.get(exam.id) || [];
      const mine = rows.find((r) => r.student_id === studentId) || null;
      if (mine) {
        result = {
          rank: mine.rank,
          total_ranked: rows.filter((r) => !r.absent).length,
          score: mine.score,
          total_marks: mine.total_marks,
          percentage: mine.percentage,
          is_provisional: mine.is_provisional,
          absent: mine.absent,
        };
      }
    }

    return {
      exam_id: exam.id,
      scheduled_class_id: exam.scheduled_class_id,
      test_id: exam.test_id,
      title: exam.title,
      opens_at: window.opens_at,
      closes_at: window.closes_at,
      is_makeup: window.is_makeup,
      duration_minutes: exam.duration_minutes,
      passing_pct: exam.passing_pct,
      results_state: exam.results_state,
      attempted: Boolean(attempt),
      attempt_id: attempt?.id ?? null,
      result,
    };
  });
}

/* ──────────────────────────── Creation ────────────────────────────────── */

export interface CreateExamSeriesInput {
  classroomIds: string[];
  testId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  durationMinutes?: number | null;
  passingPct?: number | null;
  teacherId?: string | null;
  createdBy?: string | null;
  /** Defaults to 'ranked', which is byte-identical to every pre-existing caller. */
  mode?: ExamMode;
  /** Only meaningful when mode is 'practice' -- a ranked exam stays fixed at EXAM_ATTEMPT_LIMIT. */
  attemptLimit?: number | null;
  proctoringEnabled?: boolean;
  violationLimit?: number;
  /**
   * The lecture(s) this exam tests on -- only meaningful (and only accepted
   * by the API route) when scheduling to a single classroom, since each
   * classroom has its own lecture instances. Omitted or empty is a complete
   * no-op: every exam behaves exactly as it did before this feature existed,
   * with every enrolled student mandatory.
   */
  coveredClassIds?: string[];
}

export interface CreateExamSeriesResult {
  series_id: string;
  exams: NexusExam[];
}

/**
 * Schedule one paper across one or more classrooms in a single press.
 *
 * Each classroom gets its own scheduled class, its own exam row and its own
 * placement, all sharing one series_id and one test. That is what makes the
 * cross-classroom comparison a group-by and lets each classroom's Teams post
 * carry its own podium.
 *
 * The exam rows carry kind = 'exam' and NO Teams meeting: an exam is not a
 * lecture and must not create one.
 */
export async function createExamSeries(
  input: CreateExamSeriesInput,
  client?: TypedSupabaseClient,
): Promise<CreateExamSeriesResult> {
  const supabase = client || getSupabaseAdminClient();

  const classroomIds = [...new Set(input.classroomIds.filter(Boolean))];
  if (classroomIds.length === 0) throw new Error('Pick at least one classroom');
  if (!input.testId) throw new Error('Pick the paper this exam sits');

  const opensAt = new Date(input.opensAt);
  const closesAt = new Date(input.closesAt);
  if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime())) {
    throw new Error('That is not a valid exam window');
  }
  if (closesAt <= opensAt) throw new Error('An exam has to close after it opens');

  // The sitting cannot be longer than the window it sits in, or the timer
  // promises time the door will not stay open for.
  const windowMinutes = Math.floor((closesAt.getTime() - opensAt.getTime()) / 60000);
  const duration =
    typeof input.durationMinutes === 'number' && input.durationMinutes > 0
      ? Math.min(Math.floor(input.durationMinutes), windowMinutes)
      : null;

  const opens = splitLocalDateTime(input.opensAt);
  const closes = splitLocalDateTime(input.closesAt);
  const seriesId = crypto.randomUUID();
  const title = input.title.trim() || 'Exam';
  const passingPct = input.passingPct ?? EXAM_DEFAULT_PASSING_PCT;
  const mode: ExamMode = input.mode ?? 'ranked';
  const proctoringEnabled = input.proctoringEnabled ?? false;
  const violationLimit = input.violationLimit ?? 3;
  // A ranked exam stays fixed at one attempt, whatever attemptLimit was passed.
  // Only practice mode may raise it -- undefined falls back to EXAM_ATTEMPT_LIMIT
  // inside upsertExamPlacement, explicit null means unlimited.
  const attemptLimit: number | null | undefined = mode === 'practice' ? input.attemptLimit : undefined;

  const exams: NexusExam[] = [];

  for (const classroomId of classroomIds) {
    const { data: clsRow, error: clsErr } = await supabase
      .from(CLASSES)
      .insert({
        classroom_id: classroomId,
        title,
        kind: 'exam',
        scheduled_date: opens.date,
        start_time: opens.time,
        end_time: closes.time,
        status: 'scheduled',
        publish_state: 'published',
        teacher_id: input.teacherId ?? null,
        description: 'Scheduled exam',
      })
      .select('id')
      .single();
    if (clsErr) throw clsErr;
    const cls = clsRow as any;

    const { data: exam, error: examErr } = await supabase
      .from(EXAMS)
      .insert({
        scheduled_class_id: cls.id,
        series_id: seriesId,
        classroom_id: classroomId,
        test_id: input.testId,
        title,
        opens_at: input.opensAt,
        closes_at: input.closesAt,
        duration_minutes: duration,
        passing_pct: passingPct,
        mode,
        proctoring_enabled: proctoringEnabled,
        violation_limit: violationLimit,
        created_by: input.createdBy ?? null,
      })
      .select('*')
      .single();
    if (examErr) throw examErr;
    const examRow = exam as any;

    await upsertExamPlacement(
      {
        scheduledClassId: cls.id,
        examId: examRow.id,
        testId: input.testId,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        passingPct,
        attemptLimit,
        createdBy: input.createdBy ?? null,
      },
      supabase,
    );

    // Only meaningful for a single-classroom schedule (the API route enforces
    // this), but linkExamToClasses itself also only links classes that
    // actually belong to `classroomId`, so a stray multi-classroom call would
    // silently link nothing rather than cross-link the wrong classroom.
    if (input.coveredClassIds && input.coveredClassIds.length > 0) {
      await linkExamToClasses(examRow.id, classroomId, input.coveredClassIds, supabase);
    }

    exams.push(examRow as NexusExam);
  }

  return { series_id: seriesId, exams };
}

/**
 * Put a paper on an exam, reviving a prior link rather than inserting one.
 *
 * uq_placement_test_context is UNIQUE(context_type, context_id, test_id) with
 * NO `WHERE is_active`, so a deactivated row holds its triple forever and
 * swapping a paper back to one this exam previously used 23505s on a plain
 * insert. Same trap, same fix, as attachClassTest and linkTestToQBPaper.
 */
async function upsertExamPlacement(
  input: {
    scheduledClassId: string;
    examId: string;
    testId: string;
    opensAt: string;
    closesAt: string;
    passingPct: number | null;
    /**
     * A number caps attempts at that many. null means unlimited (practice mode
     * only -- startOrResumeAttempt treats a missing attempt_limit key as no
     * limit, same as the wizard's own 'unlimited' choice writes gating = {}).
     * undefined (every ranked-exam caller, and any caller written before this
     * feature existed) keeps the historical EXAM_ATTEMPT_LIMIT default.
     */
    attemptLimit?: number | null;
    createdBy: string | null;
  },
  supabase: TypedSupabaseClient,
): Promise<void> {
  // Only one paper may be active on an exam (uq_placement_single_test), so
  // retire whatever is there before putting the new one up.
  await supabase
    .from(PLACEMENTS)
    .update({ is_active: false })
    .eq('context_type', CONTEXT)
    .eq('context_id', input.scheduledClassId)
    .eq('is_active', true);

  const gating: Record<string, unknown> = { exam_id: input.examId, required: true };
  if (input.attemptLimit !== null) {
    gating.attempt_limit = input.attemptLimit ?? EXAM_ATTEMPT_LIMIT;
  }

  const { data: prior } = await supabase
    .from(PLACEMENTS)
    .select('id')
    .eq('context_type', CONTEXT)
    .eq('context_id', input.scheduledClassId)
    .eq('test_id', input.testId)
    .maybeSingle();

  if (prior) {
    const { error } = await supabase
      .from(PLACEMENTS)
      .update({
        is_active: true,
        is_visible: true,
        passing_pct: input.passingPct,
        available_from: input.opensAt,
        available_until: input.closesAt,
        gating,
      })
      .eq('id', (prior as any).id);
    if (error) throw error;
    return;
  }

  await createPlacement(
    {
      testId: input.testId,
      contextType: CONTEXT as any,
      contextId: input.scheduledClassId,
      passingPct: input.passingPct ?? undefined,
      availableFrom: input.opensAt,
      // THE EXCEPTION. A hard close, on purpose. See the file header.
      availableUntil: input.closesAt,
      gating,
      createdBy: input.createdBy ?? undefined,
    },
    supabase,
  );
}

export interface UpdateExamInput {
  title?: string;
  opensAt?: string;
  closesAt?: string;
  durationMinutes?: number | null;
  passingPct?: number | null;
  testId?: string;
}

/** Change an exam. Any window change resyncs the two mirrors. */
export async function updateExam(
  examId: string,
  patch: UpdateExamInput,
  client?: TypedSupabaseClient,
): Promise<NexusExam> {
  const supabase = client || getSupabaseAdminClient();
  const exam = await getExam(examId, supabase);
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  if (exam.results_state !== 'unpublished' && (patch.testId || patch.opensAt || patch.closesAt)) {
    throw new Error('Results are already published. Unpublish before changing the paper or window.');
  }

  const opensAt = patch.opensAt ?? exam.opens_at;
  const closesAt = patch.closesAt ?? exam.closes_at;
  if (new Date(closesAt) <= new Date(opensAt)) {
    throw new Error('An exam has to close after it opens');
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.opensAt !== undefined) update.opens_at = patch.opensAt;
  if (patch.closesAt !== undefined) update.closes_at = patch.closesAt;
  if (patch.passingPct !== undefined) update.passing_pct = patch.passingPct;
  if (patch.durationMinutes !== undefined) {
    const windowMinutes = Math.floor(
      (new Date(closesAt).getTime() - new Date(opensAt).getTime()) / 60000,
    );
    update.duration_minutes =
      typeof patch.durationMinutes === 'number' && patch.durationMinutes > 0
        ? Math.min(Math.floor(patch.durationMinutes), windowMinutes)
        : null;
  }
  if (patch.testId !== undefined) update.test_id = patch.testId;

  const { data, error } = await supabase
    .from(EXAMS)
    .update(update)
    .eq('id', examId)
    .select('*')
    .single();
  if (error) throw error;
  const updated = data as any;

  if (patch.testId && patch.testId !== exam.test_id) {
    // Swapping the paper must not silently reset a practice exam's attempt
    // limit back to the ranked default: carry the prior placement's gating
    // forward exactly, including "no attempt_limit key" (unlimited).
    const priorPlacement = (await getExamPlacement(examId, supabase)) as { gating?: Record<string, unknown> } | null;
    const priorGating = priorPlacement?.gating || {};
    await upsertExamPlacement(
      {
        scheduledClassId: exam.scheduled_class_id,
        examId,
        testId: patch.testId,
        opensAt,
        closesAt,
        passingPct: updated.passing_pct,
        attemptLimit: 'attempt_limit' in priorGating ? (priorGating.attempt_limit as number) : null,
        createdBy: exam.created_by,
      },
      supabase,
    );
  }

  await syncExamWindow(examId, supabase);
  return (await getExam(examId, supabase))!;
}

/** Cancel an exam. Deletes the timetable row, which cascades to the exam. */
export async function cancelExam(examId: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const exam = await getExam(examId, supabase);
  if (!exam) return;

  const { count } = await supabase
    .from(ATTEMPTS)
    .select('id', { count: 'exact', head: true })
    .eq('test_id', exam.test_id);
  if ((count ?? 0) > 0 && exam.results_state !== 'unpublished') {
    throw new Error('Results are published. This exam can no longer be cancelled.');
  }

  await supabase
    .from(PLACEMENTS)
    .update({ is_active: false })
    .eq('context_type', CONTEXT)
    .eq('context_id', exam.scheduled_class_id);

  const { error } = await supabase.from(CLASSES).delete().eq('id', exam.scheduled_class_id);
  if (error) throw error;
}

/**
 * Close an exam early, or on time.
 *
 * Auto-submits every attempt still open. Reuses submitAttempt so an
 * auto-submitted paper is graded by exactly the same code as one a student
 * pressed submit on, rather than a second grading path that can drift.
 *
 * Exposed both as the teacher's "Close exam now" button and as the hourly
 * sweep, so nobody waits an hour for a paper to be marked.
 */
export async function closeExamNow(
  examId: string,
  submitAttemptFn: (attemptId: string) => Promise<unknown>,
  client?: TypedSupabaseClient,
): Promise<{ closed: number }> {
  const supabase = client || getSupabaseAdminClient();
  const exam = await getExam(examId, supabase);
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  const { data: open, error } = await supabase
    .from(ATTEMPTS)
    .select('id')
    .eq('test_id', exam.test_id)
    .eq('status', 'in_progress');
  if (error) throw error;

  let closed = 0;
  for (const row of (open || []) as any[]) {
    try {
      await submitAttemptFn(row.id);
      closed += 1;
    } catch (err) {
      // One student's paper failing to auto-submit must not stop the rest.
      console.error(`[closeExamNow] attempt ${row.id} did not submit:`, err);
    }
  }

  // Pull the door shut, so a late POST is refused even if the sweep runs
  // before the wall clock catches up.
  if (new Date(exam.closes_at) > new Date()) {
    await updateExam(examId, { closesAt: new Date().toISOString() }, supabase);
  }

  return { closed };
}

/** Exams whose window has closed but which still hold open attempts. */
export async function listExamsNeedingClose(
  client?: TypedSupabaseClient,
): Promise<NexusExam[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(EXAMS)
    .select('*')
    .lt('closes_at', new Date().toISOString())
    // A week is generous for a sweep that runs hourly, and bounds the scan.
    .gt('closes_at', new Date(Date.now() - 7 * 86_400_000).toISOString());
  if (error) throw error;
  return (data || []) as unknown as NexusExam[];
}

/* ─────────────────────────── Result snapshot ──────────────────────────── */

export interface ExamResultRow {
  exam_id: string;
  student_id: string;
  attempt_id: string | null;
  rank: number | null;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  section_scores: unknown;
  is_provisional: boolean;
  absent: boolean;
  notified_at: string | null;
  published_at: string;
}

export async function saveExamResults(
  examId: string,
  rows: Array<Omit<ExamResultRow, 'exam_id' | 'published_at' | 'notified_at'>>,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  if (rows.length === 0) return;

  const { error } = await supabase.from(RESULTS).upsert(
    rows.map((r) => ({ ...r, exam_id: examId, published_at: new Date().toISOString() })),
    { onConflict: 'exam_id,student_id' },
  );
  if (error) throw error;
}

export async function getExamResultRows(
  examId: string,
  client?: TypedSupabaseClient,
): Promise<ExamResultRow[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RESULTS)
    .select('*')
    .eq('exam_id', examId)
    .order('rank', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []) as unknown as ExamResultRow[];
}

export async function markExamResultsNotified(
  examId: string,
  studentIds: string[],
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  if (studentIds.length === 0) return;
  const { error } = await supabase
    .from(RESULTS)
    .update({ notified_at: new Date().toISOString() })
    .eq('exam_id', examId)
    .in('student_id', studentIds);
  if (error) throw error;
}

export async function setExamResultsState(
  examId: string,
  state: ExamResultsState,
  publishedBy: string | null,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(EXAMS)
    .update({
      results_state: state,
      results_published_at: state === 'unpublished' ? null : new Date().toISOString(),
      results_published_by: state === 'unpublished' ? null : publishedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', examId);
  if (error) throw error;
}

export async function recordExamTeamsPost(
  examId: string,
  messageId: string | null,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  await supabase
    .from(EXAMS)
    .update({ teams_results_message_id: messageId, teams_results_posted_at: new Date().toISOString() })
    .eq('id', examId);
}
