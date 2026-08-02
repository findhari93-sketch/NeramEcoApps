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

/** Run one `.in()` query per chunk and flatten, so callers see a single list. */
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
    selectIn(supabase, 'nexus_test_placements', 'id, test_id, context_id, passing_pct', 'context_id', allClassIds,
      (q) => q.eq('context_type', 'catchup_class').eq('is_active', true)),
  ]);

  const recapByClass = new Map<string, { id: string }>();
  for (const r of recaps) recapByClass.set(r.scheduled_class_id, { id: r.id });

  const assignmentsByClass = new Map<string, { id: string }[]>();
  for (const a of assignments) {
    const list = assignmentsByClass.get(a.scheduled_class_id) || [];
    list.push({ id: a.id });
    assignmentsByClass.set(a.scheduled_class_id, list);
  }

  const testByClass = new Map<string, { id: string; test_id: string; passing_pct: number | null }>();
  for (const p of placements) {
    testByClass.set(p.context_id, { id: p.id, test_id: p.test_id, passing_pct: p.passing_pct });
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
    out.set(studentId, {
      // The class-level maps are shared by reference on purpose. Callers only ever
      // read them, and they hold the same answer for everyone.
      recapByClass,
      assignmentsByClass,
      testByClass,
      completedRecaps: completedByStudent.get(studentId) || new Set<string>(),
      submitted: submittedByStudent.get(studentId) || new Set<string>(),
    });
  }

  return out;
}
