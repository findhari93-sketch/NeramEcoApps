/**
 * The test a class sets, due after it.
 *
 * The after-class counterpart of class-prep.ts, and the two are deliberately
 * asymmetric in three ways that are easy to "tidy" back into bugs:
 *
 *   1. THE DEADLINE IS SOFT. It lives in gating.due_at, never in the placement's
 *      available_until. api/tests/attempt refuses a placement whose
 *      available_until has passed, so putting the due date there would mean a
 *      student who misses it can never sit the paper again: the reminder we send
 *      them would point at a locked door, and a required test would become
 *      impossible to clear from a catch-up backlog. Late is late; the door stays
 *      open. Same rule the prep gate settled on, for the same reason.
 *
 *   2. THERE IS NO PER-STUDENT STATE TABLE. Completion is derived live from
 *      nexus_test_attempts. The prep gate needs nexus_class_prep_state because it
 *      also stores OBSERVED facts (blocked join attempts, the reason a student
 *      gave) that nothing else could reproduce. This feature observes nothing, so
 *      a cache here could only ever be a second opinion that drifts.
 *
 *   3. IT STAYS SETTABLE AFTER THE CLASS HAS RUN. The prep route refuses any
 *      change once the class has started because there is nothing left to prepare
 *      for. Setting a test from the class you have just taught is the normal path
 *      here, so that guard must not be copied across.
 *
 * Deliberately NOT @ts-nocheck. nexus_test_placements and
 * nexus_class_test_reminders are missing from database.generated.ts, so those two
 * tables are cast at the call, but every calculation below stays type-checked.
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { countRowsByKey } from '../../utils/paged-rows';
import { composeTest, createPlacement } from './test-repository';
import { prepPassSummary } from './class-prep';
import type { NexusTestKind } from '../../types';

const PLACEMENTS = 'nexus_test_placements';
const ATTEMPTS = 'nexus_test_attempts';
const REMINDERS = 'nexus_class_test_reminders';
const CONTEXT = 'class_test' as const;

/** Default pass mark. Lower than the prep test's 70: this is the real material. */
export const CLASS_TEST_DEFAULT_PASSING_PCT = 60;

/** How long a student gets by default, counted from the class. */
export const CLASS_TEST_DEFAULT_DUE_DAYS = 3;

/**
 * A class test is a whole class's worth of questions, not a doorway check, so the
 * prep test's 15 would be far too tight. Still capped: past this it is a mock,
 * and a mock belongs in the library rather than bolted to one evening's class.
 */
export const CLASS_TEST_MAX_QUESTIONS = 40;

/** Formats the composed-test grader can actually mark. */
const GRADABLE_FORMATS = new Set(['MCQ', 'NUMERICAL']);

/**
 * Kinds that must only ever be opened through their own route. Reusing one as a
 * class test would either hand a student a gated paper through the ordinary take
 * engine, or (if we rewrote its kind, as the prep route does) silently break the
 * class that is gating on it.
 */
const GATED_KINDS = new Set<NexusTestKind>(['class_prep', 'catchup_class', 'assignment']);

export interface ClassTestInfo {
  placement_id: string;
  test_id: string;
  title: string;
  passing_pct: number;
  question_count: number;
  total_marks: number;
  is_published: boolean;
  /** Questions that must be correct to clear the pass mark. */
  must_get_right: number;
  /** Set when the paper is short enough that the pass mark is near-perfect. */
  warning?: string;
  /** The deadline, ISO. Soft: past it the paper is late, never shut. */
  due_at: string | null;
  /** False makes it a suggestion: it never blocks anything, anywhere. */
  required: boolean;
}

/** Read the two gating fields without trusting their shape. */
function readGating(gating: unknown): { due_at: string | null; required: boolean } {
  const g = (gating || {}) as Record<string, unknown>;
  return {
    due_at: typeof g.due_at === 'string' ? g.due_at : null,
    // Required unless it explicitly says otherwise, so a placement written before
    // this field existed, or by hand, errs towards being asked for.
    required: g.required !== false,
  };
}

function shapeInfo(placement: any, test: any, questionCount: number): ClassTestInfo {
  const passingPct = placement.passing_pct ?? CLASS_TEST_DEFAULT_PASSING_PCT;
  return {
    placement_id: placement.id,
    test_id: placement.test_id,
    title: test.title,
    passing_pct: passingPct,
    question_count: questionCount,
    total_marks: Number(test.total_marks) || questionCount,
    is_published: test.is_published !== false,
    ...prepPassSummary(passingPct, questionCount),
    ...readGating(placement.gating),
  };
}

/** The active class test for one class, if the teacher has set one. */
export async function getClassTest(
  scheduledClassId: string,
  client?: TypedSupabaseClient,
): Promise<ClassTestInfo | null> {
  const map = await loadClassTests([scheduledClassId], client);
  return map.get(scheduledClassId) ?? null;
}

/**
 * Class tests for a set of classes, in one batched pass.
 *
 * The shape the catch-up backlog, the student's Tests screen and the prep gate
 * all need. A per-class fetch would be the anti-pattern those three routes were
 * each rewritten to remove.
 */
export async function loadClassTests(
  scheduledClassIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, ClassTestInfo>> {
  const out = new Map<string, ClassTestInfo>();
  if (scheduledClassIds.length === 0) return out;

  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: placements, error } = await supabase
    .from(PLACEMENTS)
    .select('id, test_id, context_id, passing_pct, gating')
    .eq('context_type', CONTEXT)
    .in('context_id', scheduledClassIds)
    .eq('is_active', true);

  // Checked, not ignored, and this is the reason why.
  //
  // 'class_test' is an enum value. On a database where the migration has not
  // landed, PostgREST answers this filter with an error and no rows, and
  // destructuring `data` alone turns that into a silent "no class has a test".
  // Every teacher would then see an empty After class slot, set a paper, and
  // watch it vanish, with nothing anywhere saying why. Failing loudly is the
  // only version of this anyone can debug.
  if (error) throw error;

  const rows = (placements || []) as any[];
  if (rows.length === 0) return out;

  const testIds = [...new Set(rows.map((p) => p.test_id))];
  const [{ data: tests, error: testErr }, countByTest] = await Promise.all([
    supabase.from('nexus_tests').select('id, title, total_marks, is_published').in('id', testIds),
    // One pull tallied in memory rather than a count per test, matching how the
    // teacher hub counts questions. Paged to exhaustion because PostgREST caps a
    // response at 1000 rows whatever range is asked for, and a truncated pull
    // here quietly understates "pass at 6 of 8".
    //
    // A failed question tally is NOT fatal, unlike the test read beside it. It
    // costs the card its "pass at 6 of 8" line, which is a worse card rather
    // than a wrong one, and refusing to show a test a teacher has set because a
    // count query hiccuped would be the more expensive failure.
    countRowsByKey(
      () => supabase.from('nexus_test_questions').select('test_id').in('test_id', testIds),
      'test_id',
    ).catch(() => new Map<string, number>()),
  ]);

  if (testErr) throw testErr;

  const testById = new Map<string, any>(((tests || []) as any[]).map((t) => [t.id, t]));

  for (const p of rows) {
    const test = testById.get(p.test_id);
    // A placement whose test was hard-deleted. Skipped rather than shaped into a
    // half-empty card that a student could tap.
    if (!test) continue;
    out.set(p.context_id, shapeInfo(p, test, countByTest.get(p.test_id) || 0));
  }
  return out;
}

export interface AttachClassTestInput {
  scheduledClassId: string;
  classroomId: string;
  /** Reuse an existing repository test. Mutually exclusive with questionIds. */
  testId?: string;
  /** Compose a new test from bank questions. Mutually exclusive with testId. */
  questionIds?: string[];
  title?: string;
  passingPct?: number;
  /** ISO. Defaults to CLASS_TEST_DEFAULT_DUE_DAYS after `classDateIso`. */
  dueAt?: string | null;
  /** Optional means it never blocks a class or a catch-up item. Defaults true. */
  required?: boolean;
  /** The class's own start, used only to default the deadline. */
  classDateIso?: string | null;
  createdBy?: string | null;
}

/**
 * Attach a class test, replacing whatever was there.
 *
 * The prior placement is deactivated BEFORE the insert so the
 * one-active-test-per-class index cannot trip. The prior TEST is left active,
 * exactly as attachClassPrepTest does: a class test may be a reusable repository
 * paper that is also set on another class, and deactivating it here would
 * silently break that one too.
 */
export async function attachClassTest(
  input: AttachClassTestInput,
  client?: TypedSupabaseClient,
): Promise<ClassTestInfo> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  if (!input.testId && !(input.questionIds && input.questionIds.length > 0)) {
    throw new Error('Provide either testId or a non-empty questionIds');
  }
  if (input.testId && input.questionIds?.length) {
    throw new Error('Provide testId or questionIds, not both');
  }

  const passingPct = clampPassingPct(input.passingPct);
  const required = input.required !== false;
  const dueAt = resolveDueAt(input.dueAt, input.classDateIso);

  const questionIds = input.questionIds ? [...new Set(input.questionIds)] : null;
  if (questionIds) {
    if (questionIds.length > CLASS_TEST_MAX_QUESTIONS) {
      throw new Error(
        `A class test tops out at ${CLASS_TEST_MAX_QUESTIONS} questions, and ${questionIds.length} were picked.`,
      );
    }
    // Every question must be one the grader can mark. A drawing prompt inside a
    // paper with a pass mark is unmarkable, and scoring it out of the total would
    // either award free marks or make the test unpassable.
    const { data: rows } = await supabase
      .from('nexus_qb_questions')
      .select('id, question_format')
      .in('id', questionIds);
    const ungradable = ((rows || []) as any[]).filter(
      (q) => !GRADABLE_FORMATS.has(String(q.question_format || '').toUpperCase()),
    );
    if (ungradable.length > 0) {
      throw new Error(
        `A class test can only hold MCQ or numerical questions. Remove ${ungradable.length} that cannot be auto-marked.`,
      );
    }
  }

  let testId = input.testId ?? null;
  if (!testId && questionIds) {
    const test = await composeTest(
      {
        title: input.title?.trim() || 'Test for this class',
        description: 'Complete this after the class.',
        questionIds,
        marks: 1,
        timerType: 'none',
        isPublished: true,
        isRepository: true,
        // Deliberately an ordinary kind, NOT a new gated one. A gated kind is
        // refused by api/tests/attempt, which would mean building a second player
        // and a second grader for a paper that needs neither. Everything special
        // about a class test lives on its placement.
        testKind: 'classroom_assigned',
        createdFrom: 'class_test',
        createdBy: input.createdBy ?? null,
        // Deliberately NOT set, even though the test is not gated. api/tests
        // lists every published test carrying a classroom_id as "assigned by your
        // teacher", with no deadline and no link to the class it belongs to. This
        // paper reaches students through its own list, which knows both.
        classroomId: null,
        shuffle: false,
      },
      supabase,
    );
    testId = test.id;
  } else if (testId) {
    const { data: existing } = await supabase
      .from('nexus_tests')
      .select('id, test_kind')
      .eq('id', testId)
      .maybeSingle();
    if (!existing) throw new Error('That test no longer exists.');
    // Unlike the prep route, the kind is NOT rewritten. Converting a paper that
    // is gating another class would unlock that class's door as a side effect of
    // reusing it here.
    if (GATED_KINDS.has(existing.test_kind as NexusTestKind)) {
      throw new Error(
        'That paper belongs to another class and can only be opened from there. Pick a different test.',
      );
    }
  }

  await deactivateClassTestPlacements(supabase, input.scheduledClassId);

  const gating = { required, due_at: dueAt };

  // Revive rather than insert when this exact test has been on this exact class
  // before. See the reader's warning in 20260823090100_nexus_class_test.sql: the
  // second uniqueness rule on this table has no `WHERE is_active` predicate, so a
  // deactivated row occupies its (context_type, context_id, test_id) triple
  // forever and a plain insert 23505s on "put the same paper back".
  const { data: prior } = await supabase
    .from(PLACEMENTS)
    .select('id')
    .eq('context_type', CONTEXT)
    .eq('context_id', input.scheduledClassId)
    .eq('test_id', testId)
    .maybeSingle();

  if (prior) {
    const { error } = await supabase
      .from(PLACEMENTS)
      .update({ is_active: true, is_visible: true, passing_pct: passingPct, gating })
      .eq('id', prior.id);
    if (error) throw error;
  } else {
    await createPlacement(
      {
        testId: testId as string,
        contextType: CONTEXT,
        contextId: input.scheduledClassId,
        passingPct,
        gating,
        createdBy: input.createdBy ?? null,
      },
      supabase,
    );
  }

  const info = await getClassTest(input.scheduledClassId, supabase);
  if (!info) throw new Error('Placement was created but could not be read back');
  return info;
}

export interface UpdateClassTestInput {
  passingPct?: number;
  dueAt?: string | null;
  required?: boolean;
}

/** Change the bar, the deadline or the Required switch, leaving the paper alone. */
export async function updateClassTest(
  scheduledClassId: string,
  patch: UpdateClassTestInput,
  client?: TypedSupabaseClient,
): Promise<ClassTestInfo | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: placement } = await supabase
    .from(PLACEMENTS)
    .select('id, gating')
    .eq('context_type', CONTEXT)
    .eq('context_id', scheduledClassId)
    .eq('is_active', true)
    .maybeSingle();
  if (!placement) return null;

  const current = readGating(placement.gating);
  const update: Record<string, unknown> = {
    // Read-modify-write the whole object: a jsonb column has no partial update
    // through PostgREST, so patching one key by sending only that key would drop
    // the other.
    gating: {
      required: patch.required === undefined ? current.required : patch.required !== false,
      due_at: patch.dueAt === undefined ? current.due_at : normaliseDueAt(patch.dueAt),
    },
  };
  if (patch.passingPct !== undefined) update.passing_pct = clampPassingPct(patch.passingPct);

  const { error } = await supabase.from(PLACEMENTS).update(update).eq('id', placement.id);
  if (error) throw error;

  return getClassTest(scheduledClassId, supabase);
}

/** Detach the class test. Soft, so past attempts and the paper survive. */
export async function detachClassTest(
  scheduledClassId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  await deactivateClassTestPlacements(supabase, scheduledClassId);
}

async function deactivateClassTestPlacements(
  supabase: any,
  scheduledClassId: string,
): Promise<void> {
  const { error } = await supabase
    .from(PLACEMENTS)
    .update({ is_active: false })
    .eq('context_type', CONTEXT)
    .eq('context_id', scheduledClassId)
    .eq('is_active', true);
  // A failure here must stop the caller. attachClassTest deactivates BEFORE it
  // inserts, so carrying on would try to leave two active placements on one
  // class and trip the unique index with a Postgres constraint name rather than
  // a sentence; detachClassTest would report a removal that did not happen.
  if (error) throw error;
}

function clampPassingPct(pct: number | undefined): number {
  const n = Math.round(Number(pct));
  if (!Number.isFinite(n)) return CLASS_TEST_DEFAULT_PASSING_PCT;
  return Math.min(100, Math.max(1, n));
}

/** An unparseable date is dropped rather than stored, so it cannot read as "due never". */
function normaliseDueAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function resolveDueAt(dueAt: string | null | undefined, classDateIso: string | null | undefined): string | null {
  const explicit = normaliseDueAt(dueAt);
  if (explicit) return explicit;
  // Only defaulted when the caller passed nothing at all. An explicit null means
  // "no deadline", which is a legitimate thing for a teacher to want.
  if (dueAt === null) return null;
  const base = classDateIso ? Date.parse(classDateIso) : NaN;
  if (!Number.isFinite(base)) return null;
  return new Date(base + CLASS_TEST_DEFAULT_DUE_DAYS * 86_400_000).toISOString();
}

// ============================================
// WHO HAS DONE IT
// ============================================

export interface ClassTestRosterRow {
  student_id: string;
  /** Best submitted official attempt, or null if they have not sat it. */
  best_pct: number | null;
  attempts: number;
  /** The FIRST passing attempt, so it is stable once set. */
  passed_at: string | null;
}

/**
 * Per-student standing on one class test, derived from the attempts themselves.
 *
 * Submitted official attempts only, matching every other surface that reports a
 * best score: api/tests/attempt writes 'abandoned', which the CHECK rejects, so
 * stale in_progress rows exist and would inflate a number a teacher reads as
 * effort. Practice-mode sittings are excluded for the same reason the student's
 * own list excludes them, so the two agree.
 */
export async function getClassTestRoster(
  scheduledClassId: string,
  studentIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, ClassTestRosterRow>> {
  const out = new Map<string, ClassTestRosterRow>();
  if (studentIds.length === 0) return out;

  const supabase = (client || getSupabaseAdminClient()) as any;
  const info = await getClassTest(scheduledClassId, supabase);
  if (!info) return out;

  const { data: attempts, error } = await supabase
    .from(ATTEMPTS)
    .select('student_id, percentage, submitted_at')
    .eq('test_id', info.test_id)
    .eq('mode', 'official')
    .eq('status', 'submitted')
    .in('student_id', studentIds);

  // A swallowed error here reads as "nobody has passed", which sends a reminder
  // to a whole class that has already done the work.
  if (error) throw error;

  for (const a of (attempts || []) as any[]) {
    const pct = a.percentage == null ? null : Number(a.percentage);
    const row = out.get(a.student_id) || {
      student_id: a.student_id,
      best_pct: null,
      attempts: 0,
      passed_at: null,
    };
    row.attempts += 1;
    if (pct != null && (row.best_pct == null || pct > row.best_pct)) row.best_pct = pct;
    // >= on the two-decimal percentage, matching resolvePassingPct and the grader
    // exactly. If these ever disagree a student sees "Passed, 62%" beside a class
    // that still says they owe it.
    if (pct != null && pct >= info.passing_pct) {
      if (!row.passed_at || (a.submitted_at && a.submitted_at < row.passed_at)) {
        row.passed_at = a.submitted_at ?? row.passed_at;
      }
    }
    out.set(a.student_id, row);
  }

  return out;
}

/**
 * Which of these students have passed which of these tests.
 *
 * The batched form the catch-up backlog needs: it holds many classes at once and
 * must not run a query per class. Returns the set of test ids this ONE student
 * has cleared, keyed by test rather than class because the same paper may be set
 * on two classes.
 */
export async function loadPassedClassTests(
  studentId: string,
  tests: { test_id: string; passing_pct: number }[],
  client?: TypedSupabaseClient,
): Promise<Set<string>> {
  const passed = new Set<string>();
  if (tests.length === 0) return passed;

  const supabase = (client || getSupabaseAdminClient()) as any;
  const barByTest = new Map<string, number>();
  for (const t of tests) barByTest.set(t.test_id, t.passing_pct);

  const { data: attempts, error } = await supabase
    .from(ATTEMPTS)
    .select('test_id, percentage')
    .eq('student_id', studentId)
    .eq('mode', 'official')
    .eq('status', 'submitted')
    .in('test_id', [...barByTest.keys()]);

  // Same reason as getClassTestRoster: silently "not passed" is the answer that
  // holds a student on a backlog they have already cleared.
  if (error) throw error;

  for (const a of (attempts || []) as any[]) {
    const pct = a.percentage == null ? null : Number(a.percentage);
    const bar = barByTest.get(a.test_id);
    if (pct != null && bar != null && pct >= bar) passed.add(a.test_id);
  }
  return passed;
}

// ============================================
// REMINDERS
// ============================================

export interface ClassTestReminderInput {
  placement_id: string;
  student_id: string;
  /** Null means the nightly sweep. A user id means a teacher pressed Remind. */
  sent_by?: string | null;
  channel?: string | null;
  template?: string | null;
}

/** Log one reminder. Never throws: the nudge went out either way. */
export async function recordClassTestReminder(
  input: ClassTestReminderInput,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { error } = await supabase.from(REMINDERS).insert({
    placement_id: input.placement_id,
    student_id: input.student_id,
    sent_by: input.sent_by ?? null,
    channel: input.channel ?? null,
    template: input.template ?? null,
  });
  if (error) console.error('recordClassTestReminder failed:', error.message);
}

/** Students already chased about this placement inside the cooldown. */
export async function loadRecentClassTestReminders(
  placementId: string,
  template: string,
  sinceIso: string,
  client?: TypedSupabaseClient,
): Promise<Set<string>> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data } = await supabase
    .from(REMINDERS)
    .select('student_id')
    .eq('placement_id', placementId)
    .eq('template', template)
    .gte('sent_at', sinceIso);
  return new Set(((data || []) as any[]).map((r) => r.student_id));
}

/** How many reminders each student has had about this placement, all time. */
export async function countClassTestReminders(
  placementId: string,
  client?: TypedSupabaseClient,
): Promise<Map<string, number>> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data } = await supabase.from(REMINDERS).select('student_id').eq('placement_id', placementId);
  const out = new Map<string, number>();
  for (const r of (data || []) as any[]) {
    out.set(r.student_id, (out.get(r.student_id) || 0) + 1);
  }
  return out;
}
