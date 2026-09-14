/**
 * Who sat a run, and which of their attempts belong to it.
 *
 * One paper is routinely several runs at once: a practice chapter in Study
 * Materials and a one-shot exam, for instance. Every screen that answered "did
 * this student sit the exam" used to answer it differently. The Students tab
 * counted the exam door only. The exam results, the invigilation roster and the
 * student's own exam card counted any attempt on the paper, through any door, at
 * any time, so a chapter practised a week earlier could stand in for the exam. On
 * the 18 Aug exam those screens disagreed about six students.
 *
 * THE RULE, decided with the founder on 2026-09-11, in order:
 *
 *   1. An attempt through the run's own door is the record. When one exists,
 *      nothing else is looked at.
 *   2. Otherwise, an official attempt through ANOTHER door of the same paper
 *      counts when it was both started and submitted inside the run's window, or
 *      inside that student's own granted window (a reopen). A practice attempt
 *      the exam-close sweep submitted after the door shut does not qualify.
 *   3. Otherwise, a teacher may count one attempt by hand
 *      (nexus_test_run_credits).
 *
 * The first submitted attempt of the sitting is the headline score, which is the
 * rule every run already follows; best stays beside it.
 *
 * PURE decision, thin loaders. Exam makeup windows are not read here: a makeup
 * student sits the exam door, which rule 1 already covers.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { fetchAllRows } from '../../utils/paged-rows';

// Cast at the name, as exams.ts does: these tables are not in the generated types.
const ATTEMPTS = 'nexus_test_attempts' as any;
const REQUESTS = 'nexus_test_access_requests' as any;
const CREDITS = 'nexus_test_run_credits' as any;

/** Matches nothing, for an `.in()` that must not widen into "everyone". */
const NONE = '00000000-0000-0000-0000-000000000000';

export type RunSittingSource = 'run' | 'window' | 'teacher';

export interface SittingAttempt {
  id: string;
  student_id: string;
  placement_id: string | null;
  status: string;
  mode?: string | null;
  started_at: string | null;
  submitted_at: string | null;
  attempt_number?: number | null;
}

export interface SittingWindow {
  opens_at: string | null;
  closes_at: string | null;
}

/** One student's live row on one run: a teacher's reopen, or their own ask. */
export interface RunAccessRequest {
  status: 'pending' | 'granted';
  source: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string | null;
}

export interface RunSitting<T extends SittingAttempt = SittingAttempt> {
  student_id: string;
  source: RunSittingSource;
  /**
   * The attempts that count on this run, oldest first. An in-progress attempt
   * only ever comes from the run's own door.
   */
  attempts: T[];
  /** The first submitted attempt: the run's headline score. Null while the only sitting is still open. */
  first: T | null;
}

export interface RunCredit {
  placement_id: string;
  student_id: string;
  attempt_id: string;
  note: string | null;
  credited_by: string | null;
  credited_at: string;
}

const isDone = (a: SittingAttempt) => a.status === 'submitted' || a.status === 'graded';

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * Started and submitted inside the window.
 *
 * Both ends are required of the window and of the attempt. An open-ended window
 * (a soft class test with no close) never qualifies, because "any time after it
 * opened" is exactly the practice-stands-in-for-the-exam reading this replaces.
 */
export function attemptInsideWindow(a: SittingAttempt, w: SittingWindow | null | undefined): boolean {
  if (!w) return false;
  const opens = toMs(w.opens_at);
  const closes = toMs(w.closes_at);
  const started = toMs(a.started_at);
  const submitted = toMs(a.submitted_at);
  if (opens == null || closes == null || started == null || submitted == null) return false;
  return started >= opens && submitted <= closes;
}

/** Oldest submission first, then attempt number, so "first" never depends on the planner. */
export function compareSittingAttempts(a: SittingAttempt, b: SittingAttempt): number {
  const sa = toMs(a.submitted_at);
  const sb = toMs(b.submitted_at);
  if (sa !== sb) {
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb;
  }
  return (Number(a.attempt_number) || 0) - (Number(b.attempt_number) || 0);
}

/**
 * The rule, for one run, over every attempt its students made on the paper.
 *
 * Pass attempts from EVERY door of the paper, not only the run's own: rules 2
 * and 3 are about the other doors. A student with no sitting is simply absent
 * from the map.
 */
export function pickRunSittings<T extends SittingAttempt>(input: {
  runPlacementId: string;
  window: SittingWindow | null;
  /** student_id -> the window a reopen gave them. */
  grantWindows?: Map<string, SittingWindow>;
  /** student_id -> the attempt a teacher chose to count. */
  credits?: Map<string, string>;
  attempts: T[];
}): Map<string, RunSitting<T>> {
  const byStudent = new Map<string, T[]>();
  for (const a of input.attempts) {
    // Revision is practice after completion and never touches a record.
    if (a.mode != null && a.mode !== 'official') continue;
    const list = byStudent.get(a.student_id) || [];
    list.push(a);
    byStudent.set(a.student_id, list);
  }

  const build = (studentId: string, source: RunSittingSource, attempts: T[]): RunSitting<T> => {
    const ordered = [...attempts].sort(compareSittingAttempts);
    return { student_id: studentId, source, attempts: ordered, first: ordered.find(isDone) ?? null };
  };

  const out = new Map<string, RunSitting<T>>();
  for (const [studentId, list] of byStudent) {
    const own = list.filter(
      (a) => a.placement_id === input.runPlacementId && (isDone(a) || a.status === 'in_progress'),
    );
    if (own.length > 0) {
      out.set(studentId, build(studentId, 'run', own));
      continue;
    }

    const elsewhere = list.filter((a) => a.placement_id !== input.runPlacementId && isDone(a));
    const grant = input.grantWindows?.get(studentId);
    const inWindow = elsewhere.filter(
      (a) => attemptInsideWindow(a, input.window) || attemptInsideWindow(a, grant),
    );
    if (inWindow.length > 0) {
      out.set(studentId, build(studentId, 'window', inWindow));
      continue;
    }

    const creditId = input.credits?.get(studentId);
    const credited = creditId ? elsewhere.find((a) => a.id === creditId) : undefined;
    if (credited) out.set(studentId, build(studentId, 'teacher', [credited]));
  }
  return out;
}

/** A run as the loaders need it. An exam placement's window mirrors nexus_exams. */
export interface RunForSittings {
  id: string;
  test_id: string;
  available_from?: string | null;
  available_until?: string | null;
}

const REQUIRED_COLUMNS = [
  'id',
  'test_id',
  'student_id',
  'placement_id',
  'status',
  'mode',
  'started_at',
  'submitted_at',
  'attempt_number',
];

function withRequiredColumns(extra?: string): string {
  const cols = new Set(REQUIRED_COLUMNS);
  for (const c of (extra || '').split(',').map((s) => s.trim()).filter(Boolean)) cols.add(c);
  return [...cols].join(', ');
}

/** The table is not on this environment yet. Rules 2 and 3 then simply find nothing. */
function isMissingTable(error: any): boolean {
  const code = String(error?.code || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(String(error?.message || ''));
}

/**
 * placement_id -> student_id -> their one live row on that run.
 *
 * At most one per pair, by uq_test_access_live. This is the ONLY batched reader
 * of nexus_test_access_requests, and loadRunGrantWindows below is a projection
 * of it rather than a second query, so no screen can read a grant through one
 * path and miss it through another.
 *
 * That is not hypothetical. The student's own Tests card resolved its exam
 * window without ever reading this table, so 26 students held a live teacher
 * grant and every one of them saw a disabled button reading "Closed"
 * (NXS-0125). Keep the readers at one.
 */
export async function loadRunAccessRequests(
  placementIds: string[],
  studentIds: string[] | null,
  client?: TypedSupabaseClient,
): Promise<Map<string, Map<string, RunAccessRequest>>> {
  const out = new Map<string, Map<string, RunAccessRequest>>();
  const ids = [...new Set(placementIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const supabase = (client || getSupabaseAdminClient()) as any;
  let query = supabase
    .from(REQUESTS)
    .select('placement_id, student_id, status, source, opens_at, closes_at, created_at')
    .in('placement_id', ids)
    .in('status', ['pending', 'granted']);
  if (studentIds) query = query.in('student_id', studentIds.length > 0 ? studentIds : [NONE]);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return out;
    throw error;
  }
  for (const r of (data || []) as any[]) {
    const byStudent = out.get(r.placement_id) || new Map<string, RunAccessRequest>();
    byStudent.set(r.student_id, {
      status: r.status,
      source: r.source ?? null,
      opens_at: r.opens_at ?? null,
      closes_at: r.closes_at ?? null,
      created_at: r.created_at ?? null,
    });
    out.set(r.placement_id, byStudent);
  }
  return out;
}

/**
 * placement_id -> student_id -> the window their reopen gave them.
 *
 * Granted rows only. A pending ask is not a door, and rule 2 must not widen a
 * student's window because they asked for one.
 */
export async function loadRunGrantWindows(
  placementIds: string[],
  studentIds: string[] | null,
  client?: TypedSupabaseClient,
): Promise<Map<string, Map<string, SittingWindow>>> {
  const live = await loadRunAccessRequests(placementIds, studentIds, client);
  const out = new Map<string, Map<string, SittingWindow>>();
  for (const [placementId, byStudent] of live) {
    for (const [studentId, row] of byStudent) {
      if (row.status !== 'granted') continue;
      const bucket = out.get(placementId) || new Map<string, SittingWindow>();
      bucket.set(studentId, { opens_at: row.opens_at, closes_at: row.closes_at });
      out.set(placementId, bucket);
    }
  }
  return out;
}

/** placement_id -> student_id -> the attempt a teacher counted. */
export async function loadRunCredits(
  placementIds: string[],
  studentIds: string[] | null,
  client?: TypedSupabaseClient,
): Promise<Map<string, Map<string, RunCredit>>> {
  const out = new Map<string, Map<string, RunCredit>>();
  const ids = [...new Set(placementIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const supabase = (client || getSupabaseAdminClient()) as any;
  let query = supabase
    .from(CREDITS)
    .select('placement_id, student_id, attempt_id, note, credited_by, credited_at')
    .in('placement_id', ids);
  if (studentIds) query = query.in('student_id', studentIds.length > 0 ? studentIds : [NONE]);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return out;
    throw error;
  }
  for (const r of (data || []) as RunCredit[]) {
    const byStudent = out.get(r.placement_id) || new Map<string, RunCredit>();
    byStudent.set(r.student_id, r);
    out.set(r.placement_id, byStudent);
  }
  return out;
}

/**
 * The rule applied to one or more runs, in three reads whatever the count.
 *
 * `columns` adds whatever the caller needs on each attempt (scores, answers) to
 * the columns the rule itself reads. Pass `studentIds` whenever the roster is
 * known: it bounds the read, which matters on a practice pool with a long tail.
 */
export async function loadRunSittings<T extends SittingAttempt = SittingAttempt>(
  runs: RunForSittings[],
  opts: { studentIds?: string[] | null; columns?: string } = {},
  client?: TypedSupabaseClient,
): Promise<Map<string, Map<string, RunSitting<T>>>> {
  const out = new Map<string, Map<string, RunSitting<T>>>();
  if (runs.length === 0) return out;

  const studentIds = opts.studentIds ?? null;
  if (studentIds && studentIds.length === 0) {
    for (const run of runs) out.set(run.id, new Map());
    return out;
  }

  const supabase = (client || getSupabaseAdminClient()) as any;
  const testIds = [...new Set(runs.map((r) => r.test_id))].filter(Boolean);
  const placementIds = runs.map((r) => r.id);

  // Paged to exhaustion. The read spans every door of the paper, and PostgREST
  // silently caps a response at 1000 rows, which on a busy practice pool would
  // quietly drop somebody's sitting.
  const buildAttemptQuery = () => {
    let query = supabase
      .from(ATTEMPTS)
      .select(withRequiredColumns(opts.columns))
      .in('test_id', testIds)
      .eq('mode', 'official')
      .in('status', ['submitted', 'graded', 'in_progress'])
      .order('id', { ascending: true });
    if (studentIds) query = query.in('student_id', studentIds);
    return query;
  };

  const [attempts, grants, credits] = await Promise.all([
    fetchAllRows<T & { test_id: string }>(buildAttemptQuery),
    loadRunGrantWindows(placementIds, studentIds, supabase),
    loadRunCredits(placementIds, studentIds, supabase),
  ]);
  for (const run of runs) {
    const creditIds = new Map<string, string>();
    for (const [sid, credit] of credits.get(run.id) || new Map<string, RunCredit>()) {
      creditIds.set(sid, credit.attempt_id);
    }
    out.set(
      run.id,
      pickRunSittings<T>({
        runPlacementId: run.id,
        window: { opens_at: run.available_from ?? null, closes_at: run.available_until ?? null },
        grantWindows: grants.get(run.id),
        credits: creditIds,
        attempts: attempts.filter((a) => a.test_id === run.test_id),
      }),
    );
  }
  return out;
}

/** Count one attempt from another door on this run. One per student per run; a second replaces the first. */
export async function setRunCredit(
  input: {
    placementId: string;
    studentId: string;
    attemptId: string;
    note?: string | null;
    creditedBy: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<RunCredit> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(CREDITS)
    .upsert(
      {
        placement_id: input.placementId,
        student_id: input.studentId,
        attempt_id: input.attemptId,
        note: input.note?.trim() || null,
        credited_by: input.creditedBy,
        credited_at: new Date().toISOString(),
      },
      { onConflict: 'placement_id,student_id' },
    )
    .select('placement_id, student_id, attempt_id, note, credited_by, credited_at')
    .single();
  if (error) throw error;
  return data as RunCredit;
}

/** Undo a count. True when there was one to remove. */
export async function removeRunCredit(
  placementId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(CREDITS)
    .delete()
    .eq('placement_id', placementId)
    .eq('student_id', studentId)
    .select('id');
  if (error) throw error;
  return ((data || []) as unknown[]).length > 0;
}
