/**
 * Applying the class prep gate to a list of classes, server side.
 *
 * Three routes hand classes to students (my-schedule, /api/timetable, the student
 * dashboard) and all three used to include teams_meeting_join_url. Rather than
 * triplicate the decision, they all call this.
 *
 * Stripping belongs at the API boundary, never in the components:
 * ClassDetailPanel and UpNextHero are shared by teachers and students, so a
 * server that hands the teacher the URL and the student null makes both correct
 * with no role branching in the UI.
 *
 * The decision itself lives in the pure class-prep-gate module. This file is only
 * the I/O around it.
 */
import { loadClassPrepStates } from '@neram/database';
import { resolveFlags, isFeatureEnabled } from '@/lib/feature-flags';
import { decideClassPrepGate } from '@/lib/class-prep-gate';
import { classStartIso } from '@/lib/prework';

export interface GateableClass {
  id: string;
  classroom_id: string;
  status?: string | null;
  scheduled_date: string;
  start_time?: string | null;
  teams_meeting_join_url?: string | null;
  teams_meeting_url?: string | null;
}

export interface ClassPrepSummary {
  gated: true;
  open: boolean;
  via: string;
  blockers: string[];
  readiness: number | null;
  has_test: boolean;
  test_best_pct: number | null;
  test_passing_pct: number | null;
  test_attempts: number;
  assignments_required: number;
  assignments_submitted: number;
  reason_given: boolean;
  /** A Required test from the previous class is riding on this one. */
  carried_over_test: boolean;
}

/**
 * Decide the gate for every class in one pass and NULL the join URL on the ones
 * that are shut. Mutates the class rows in place, which is what the callers want:
 * they return the same array.
 *
 * Cost: two `.in()` queries plus one settings read, none of which grow with the
 * class count. Anything per-class here would undo what my-schedule was rewritten
 * to achieve.
 *
 * teams_meeting_id is deliberately LEFT ALONE. Both Join renderers gate on the
 * URL's truthiness, so blanking everything would leave the student with no button
 * and no explanation, which reads as the app being broken rather than as a rule.
 */
export async function applyClassPrepGate(
  supabase: any,
  studentId: string,
  classes: GateableClass[],
  opts: {
    /** classroom_id -> that classroom's enrolment role for this user. */
    roleByClassroom: Map<string, string>;
    impersonating?: boolean;
  },
): Promise<Record<string, ClassPrepSummary>> {
  const out: Record<string, ClassPrepSummary> = {};
  if (classes.length === 0) return out;

  if (!isFeatureEnabled('student.class-prep-gate', await resolveFlags())) return out;

  const classIds = classes.map((c) => c.id);

  const [states, placementsRes] = await Promise.all([
    loadClassPrepStates(studentId, classIds, supabase),
    supabase
      .from('nexus_test_placements')
      .select('context_id, passing_pct')
      .eq('context_type', 'class_prep_test')
      .in('context_id', classIds)
      .eq('is_active', true),
  ]);

  const passingByClass = new Map<string, number>();
  for (const p of placementsRes?.data || []) {
    passingByClass.set(p.context_id, p.passing_pct ?? 70);
  }

  const carriedOver = await loadCarriedOverClassTests(supabase, studentId, classes);

  for (const cls of classes) {
    const role = opts.roleByClassroom.get(cls.classroom_id) || 'student';
    const state = states.get(cls.id);
    const passingPct = passingByClass.get(cls.id);
    const hasTest = passingPct != null;

    const decision = decideClassPrepGate({
      flagEnabled: true,
      role: role === 'student' ? 'student' : 'teacher',
      impersonating: opts.impersonating,
      test: hasTest
        ? {
            bestPct: state?.test_best_pct ?? null,
            passingPct,
            attempts: state?.test_attempts ?? 0,
          }
        : null,
      prework: {
        required: state?.assignments_required ?? 0,
        submitted: state?.assignments_submitted ?? 0,
      },
      previousClassTest: carriedOver.get(cls.id) ?? null,
      reasonGiven: !!state?.test_reason_at,
      classStatus: cls.status,
      classStartIso: classStartIso(cls.scheduled_date, cls.start_time || '00:00'),
    });

    // An ungated class produces no entry at all, so a class with no test and no
    // prework is byte-identical to how it was before this feature existed.
    if (!decision.gated) continue;

    out[cls.id] = {
      gated: true,
      open: decision.open,
      via: decision.via,
      blockers: decision.blockers,
      readiness: decision.readiness,
      has_test: hasTest,
      test_best_pct: state?.test_best_pct ?? null,
      test_passing_pct: passingPct ?? null,
      test_attempts: state?.test_attempts ?? 0,
      assignments_required: state?.assignments_required ?? 0,
      assignments_submitted: state?.assignments_submitted ?? 0,
      reason_given: !!state?.test_reason_at,
      carried_over_test: carriedOver.has(cls.id),
    };

    if (!decision.open) {
      cls.teams_meeting_join_url = null;
      cls.teams_meeting_url = null;
    }
  }

  return out;
}

/**
 * "Did the class before this one set a Required test you have not passed?"
 *
 * Only the IMMEDIATELY preceding class, deliberately. Carrying every outstanding
 * paper forward would mean one bad fortnight locks a student out of every
 * remaining class in the term, which is exactly the "homework problem becomes an
 * attendance problem" failure this gate was written to avoid. One class of
 * consequence is enough to be taken seriously; the reason escape hatch still
 * opens the door either way.
 *
 * Cost: three batched queries, none of which grow with the class count, and all
 * three are skipped the moment a cheaper one comes back empty. The caller has
 * already checked the feature flag, so classrooms with the gate switched off pay
 * nothing at all.
 */
export async function loadCarriedOverClassTests(
  supabase: any,
  studentId: string,
  classes: GateableClass[],
): Promise<Map<string, { passed: boolean }>> {
  const out = new Map<string, { passed: boolean }>();

  const classroomIds = [...new Set(classes.map((c) => c.classroom_id))].filter(Boolean);
  if (classroomIds.length === 0) return out;

  // Every published class in the classrooms involved, so "the one before" can be
  // resolved without a query per class.
  const { data: siblings } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, scheduled_date, start_time')
    .in('classroom_id', classroomIds)
    .neq('status', 'cancelled');

  const byClassroom = new Map<string, any[]>();
  for (const c of (siblings || []) as any[]) {
    const list = byClassroom.get(c.classroom_id) || [];
    list.push(c);
    byClassroom.set(c.classroom_id, list);
  }
  const sortKey = (c: any) => `${String(c.scheduled_date).slice(0, 10)}T${c.start_time || '00:00'}`;
  for (const list of byClassroom.values()) list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const previousOf = new Map<string, string>();
  for (const cls of classes) {
    const list = byClassroom.get(cls.classroom_id) || [];
    const idx = list.findIndex((c) => c.id === cls.id);
    if (idx > 0) previousOf.set(cls.id, list[idx - 1].id);
  }
  if (previousOf.size === 0) return out;

  const { data: placements } = await supabase
    .from('nexus_test_placements')
    .select('test_id, context_id, passing_pct, gating')
    .eq('context_type', 'class_test')
    .in('context_id', [...new Set(previousOf.values())])
    .eq('is_active', true);

  // Required only. An optional test is a suggestion, and a suggestion that
  // withholds a Join button is not a suggestion.
  const required = ((placements || []) as any[]).filter(
    (p) => ((p.gating || {}) as Record<string, unknown>).required !== false,
  );
  if (required.length === 0) return out;

  const { data: attempts } = await supabase
    .from('nexus_test_attempts')
    .select('test_id, percentage')
    .eq('student_id', studentId)
    .eq('mode', 'official')
    .eq('status', 'submitted')
    .in('test_id', [...new Set(required.map((p) => p.test_id))]);

  const bestByTest = new Map<string, number>();
  for (const a of (attempts || []) as any[]) {
    const pct = a.percentage == null ? null : Number(a.percentage);
    if (pct == null) continue;
    const prev = bestByTest.get(a.test_id);
    if (prev == null || pct > prev) bestByTest.set(a.test_id, pct);
  }

  const byPrevClass = new Map<string, any>();
  for (const p of required) byPrevClass.set(p.context_id, p);

  for (const [classId, prevId] of previousOf) {
    const p = byPrevClass.get(prevId);
    if (!p) continue;
    const best = bestByTest.get(p.test_id) ?? null;
    // Same comparison as resolvePassingPct and the grader: a null bar means
    // sitting it is passing it.
    const passed = p.passing_pct == null ? best != null : best != null && best >= p.passing_pct;
    // Only an OUTSTANDING one is carried. A class whose predecessor's test is
    // already passed produces no entry, so it stays ungated exactly as before.
    if (!passed) out.set(classId, { passed: false });
  }

  return out;
}
