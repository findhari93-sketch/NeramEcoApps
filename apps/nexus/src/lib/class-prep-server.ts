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
    };

    if (!decision.open) {
      cls.teams_meeting_join_url = null;
      cls.teams_meeting_url = null;
    }
  }

  return out;
}
