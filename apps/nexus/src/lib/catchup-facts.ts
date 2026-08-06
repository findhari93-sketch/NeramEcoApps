import { loadClassFacts } from '@neram/database';

/** The shape `loadClassFacts` returns, without depending on it being exported. */
export type ClassFacts = Awaited<ReturnType<typeof loadClassFacts>>;

/**
 * PostgREST sends `.in(...)` lists in the query string, so a very long list becomes a
 * very long URL. Chunking keeps each request comfortably inside every proxy's limit;
 * a whole term of assignments for a big cohort is the case that gets close.
 */
const CHUNK = 200;

function chunked<T>(items: T[]): T[][] {
  if (items.length <= CHUNK) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Run one `.in()` query per chunk and flatten, so callers see a single list.
 *
 * Surfaces the error rather than flattening it to an empty list. Every read this
 * helper performs decides something a teacher acts on: which recaps exist, which
 * assignments are in, which classes carry a test. A silent empty is
 * indistinguishable from "there are none", so a failed query would report a whole
 * cohort as finished. That became a live risk when 'class_test' joined the
 * placement filter below, because an enum value the database has not been
 * migrated to know is exactly the kind of error PostgREST returns with no rows.
 */
async function selectIn(
  supabase: any,
  table: string,
  columns: string,
  column: string,
  values: string[],
  refine?: (q: any) => any,
): Promise<any[]> {
  const groups = chunked(values);
  if (groups.length === 0) return [];

  const results = await Promise.all(
    groups.map((group) => {
      const base = supabase.from(table).select(columns).in(column, group);
      return refine ? refine(base) : base;
    }),
  );

  for (const r of results as any[]) {
    if (r?.error) throw r.error;
  }
  return results.flatMap((r: any) => r?.data || []);
}

/**
 * Everything the catch-up rules need about every student at once.
 *
 * `loadClassFacts` answers this for one student, and the overview route called it
 * inside a `for` loop over the cohort. That helper is itself six queries in two
 * sequential waves, so a forty-student classroom asked the database eighty times, in
 * series, before the teacher saw a single row. It is the reason that screen sat on a
 * skeleton, and the route's own header comment already warned that "one round trip per
 * student does not survive a cohort of fifty".
 *
 * The loop was never necessary. Three of those six reads are about the *class* and are
 * identical for everyone, so they are made once here over the union of class ids. The
 * other three are per student only because they filtered on one student id, so they
 * become one `.in(...)` over the whole cohort and are grouped in memory afterwards.
 * Six queries in total, whatever the size of the class.
 *
 * Returns a map with an entry for every student asked about, including students whose
 * facts are empty, so callers never have to null-check.
 */
export async function loadClassFactsForStudents(
  supabase: any,
  classIdsByStudent: Map<string, string[]>,
): Promise<Map<string, ClassFacts>> {
  const studentIds = [...classIdsByStudent.keys()];
  const allClassIds = [...new Set([...classIdsByStudent.values()].flat())];

  const emptyFor = (): ClassFacts => ({
    recapByClass: new Map(),
    completedRecaps: new Set(),
    assignmentsByClass: new Map(),
    submitted: new Set(),
    testByClass: new Map(),
  });

  const out = new Map<string, ClassFacts>();
  if (studentIds.length === 0 || allClassIds.length === 0) {
    studentIds.forEach((id) => out.set(id, emptyFor()));
    return out;
  }

  // Wave 1: facts about the classes themselves. Identical for every student, so this
  // runs once rather than once per person.
  const [recaps, assignments, placements] = await Promise.all([
    selectIn(supabase, 'nexus_class_recaps', 'id, scheduled_class_id', 'scheduled_class_id', allClassIds,
      (q) => q.eq('status', 'published')),
    selectIn(supabase, 'nexus_class_assignments', 'id, scheduled_class_id', 'scheduled_class_id', allClassIds,
      (q) => q.eq('status', 'published')),
    // Both kinds of end-of-class paper, matching loadClassFacts. The pick between
    // them happens below.
    selectIn(supabase, 'nexus_test_placements', 'id, test_id, context_id, context_type, passing_pct, gating', 'context_id', allClassIds,
      (q) => q.in('context_type', ['catchup_class', 'class_test']).eq('is_active', true)),
  ]);

  const recapByClass = new Map<string, { id: string }>();
  for (const r of recaps) recapByClass.set(r.scheduled_class_id, { id: r.id });

  const assignmentsByClass = new Map<string, { id: string }[]>();
  for (const a of assignments) {
    const list = assignmentsByClass.get(a.scheduled_class_id) || [];
    list.push({ id: a.id });
    assignmentsByClass.set(a.scheduled_class_id, list);
  }

  // A teacher's class test wins over the auto-generated catch-up paper, exactly
  // as loadClassFacts decides it for one student. Explicit precedence rather than
  // iteration order, because the query returns both kinds interleaved.
  type ClassTest = ClassFacts['testByClass'] extends Map<string, infer V> ? V : never;
  const testByClass = new Map<string, ClassTest>();
  for (const p of placements) {
    const isClassTest = p.context_type === 'class_test';
    const existing = testByClass.get(p.context_id);
    if (existing && existing.source === 'class_test' && !isClassTest) continue;
    const gating = (p.gating || {}) as Record<string, unknown>;
    testByClass.set(p.context_id, {
      id: p.id,
      test_id: p.test_id,
      passing_pct: p.passing_pct,
      source: isClassTest ? 'class_test' : 'catchup',
      required: isClassTest ? gating.required !== false : true,
      // Per student, so it is filled in per student below.
      passed: false,
    });
  }

  // Whether a CLASS test is passed lives in the attempts rather than on the
  // absence row, and unlike everything else in wave 1 it differs per student. One
  // query for the whole cohort; the grouping happens in memory.
  const classTests = [...testByClass.values()].filter((t) => t.source === 'class_test');
  const passedByStudent = new Map<string, Set<string>>();
  if (classTests.length > 0) {
    const barByTest = new Map<string, number | null>(
      classTests.map((t) => [t.test_id, t.passing_pct]),
    );
    const attempts = await selectIn(
      supabase,
      'nexus_test_attempts',
      'student_id, test_id, percentage',
      'test_id',
      [...barByTest.keys()],
      (q) => q.in('student_id', studentIds).eq('mode', 'official').eq('status', 'submitted'),
    );
    for (const a of attempts) {
      const pct = a.percentage == null ? null : Number(a.percentage);
      if (pct == null) continue;
      const bar = barByTest.get(a.test_id);
      // A null bar means no pass mark was set, so sitting it is passing it. Same
      // rule as resolvePassingPct, deliberately.
      if (bar != null && pct < bar) continue;
      const set = passedByStudent.get(a.student_id) || new Set<string>();
      set.add(a.test_id);
      passedByStudent.set(a.student_id, set);
    }
  }

  const recapIds = [...recapByClass.values()].map((r) => r.id);
  const assignmentIds = [...assignmentsByClass.values()].flat().map((a) => a.id);

  // Wave 2: what each student has actually done. One query per table for the entire
  // cohort, with student_id selected so the rows can be grouped below.
  const [progress, docs, draws] = await Promise.all([
    recapIds.length
      ? selectIn(supabase, 'nexus_class_recap_progress', 'recap_id, student_id', 'recap_id', recapIds,
          (q) => q.eq('status', 'completed').in('student_id', studentIds))
      : Promise.resolve([]),
    assignmentIds.length
      ? selectIn(supabase, 'nexus_assignment_submissions', 'assignment_id, student_id', 'assignment_id', assignmentIds,
          (q) => q.in('student_id', studentIds))
      : Promise.resolve([]),
    assignmentIds.length
      ? selectIn(supabase, 'drawing_submissions', 'assignment_id, student_id', 'assignment_id', assignmentIds,
          (q) => q.in('student_id', studentIds))
      : Promise.resolve([]),
  ]);

  const completedByStudent = new Map<string, Set<string>>();
  for (const p of progress) {
    const set = completedByStudent.get(p.student_id) || new Set<string>();
    set.add(p.recap_id);
    completedByStudent.set(p.student_id, set);
  }

  const submittedByStudent = new Map<string, Set<string>>();
  for (const s of [...docs, ...draws]) {
    const set = submittedByStudent.get(s.student_id) || new Set<string>();
    set.add(s.assignment_id);
    submittedByStudent.set(s.student_id, set);
  }

  for (const studentId of studentIds) {
    // Shared by reference while every paper is a catch-up one, which is the case
    // for every classroom that has not used class tests: callers only read these
    // maps and they hold the same answer for everyone. A class test breaks that,
    // because `passed` is this student's fact, so the map is copied only then.
    let testsForStudent = testByClass;
    if (classTests.length > 0) {
      const passed = passedByStudent.get(studentId) || new Set<string>();
      testsForStudent = new Map(
        [...testByClass.entries()].map(([classId, t]) => [
          classId,
          t.source === 'class_test' ? { ...t, passed: passed.has(t.test_id) } : t,
        ]),
      );
    }

    out.set(studentId, {
      recapByClass,
      assignmentsByClass,
      testByClass: testsForStudent,
      completedRecaps: completedByStudent.get(studentId) || new Set<string>(),
      submitted: submittedByStudent.get(studentId) || new Set<string>(),
    });
  }

  return out;
}
