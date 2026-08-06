/**
 * The class prep gate: the rule, in one place.
 *
 * A student may be asked to do two things before a class: pass a short prep test
 * and hand in the prework assignment. Until both are done the Join button is not
 * handed over.
 *
 * This reverses what prework.ts used to say, and the old comment was right about
 * the risk it named: "locking a student out of a class over homework converts a
 * homework problem into an attendance problem." So the door is gated, never
 * bolted. A student who says why they cannot do the work gets in immediately, and
 * the blockers stay on the record for the teacher either way.
 *
 * Three more things the shape of this file is protecting:
 *
 *   * It cannot be the security boundary. Any client can lie. The join route
 *     re-derives this decision server side from source truth, and the payload
 *     never carries the URL in the first place. This module exists so the panel,
 *     the route and the roster agree about WHY, not so the panel can be trusted.
 *
 *   * The flag arrives as an input rather than being imported, exactly as
 *     photo-gate.ts does it, so the rule stays a pure function of its arguments
 *     and the unit test can drive every branch.
 *
 *   * "Nothing was asked" and "they did none of it" are different sentences.
 *     readiness is null in the first case, never 0. parent-attendance.ts learned
 *     that the expensive way and it applies with more force here, because this
 *     number will end up in front of a parent.
 */

/** How long before the class the lock appears. */
export const PREP_GATE_LEAD_MINUTES = 180;

export type PrepBlocker =
  | 'test_not_passed'
  | 'prework_missing'
  /**
   * The PREVIOUS class set a Required test and this student has not passed it.
   *
   * Reusing this gate rather than building a second one is deliberate: a student
   * meets it in the surface they already know, with the same reason escape hatch
   * and the same retry-until-pass rule, and their teacher sees it in the same
   * roster. A second lock with its own copy and its own unlock path would be two
   * different rules for one idea.
   */
  | 'class_test_pending';

export type PrepUnlockVia =
  /** They did the work. */
  | 'earned'
  /** They told us why they could not, which opens the door and keeps the record. */
  | 'reason'
  /** Neither a test nor prework was set on this class. The common case. */
  | 'not_required'
  /** The gate is switched off for everyone. */
  | 'flag_off'
  /** Too far ahead of the class for the lock to mean anything yet. */
  | 'not_yet_armed';

export interface ClassPrepGateInput {
  /** Resolved student.class-prep-gate. Off means behave exactly as before. */
  flagEnabled: boolean;
  /** Only students are ever gated. */
  role: 'student' | 'teacher' | 'parent' | 'admin' | string;
  /** True when a teacher is using View-as-Student. */
  impersonating?: boolean;
  /** Null when this class has no prep test. */
  test: {
    bestPct: number | null;
    /** From resolvePassingPct. Null means no bar was set, which counts as passed. */
    passingPct: number | null;
    attempts: number;
  } | null;
  prework: { required: number; submitted: number };
  /**
   * The REQUIRED test set by the class immediately before this one, if it has
   * one and this student has not passed it. Null in every other case, including
   * an optional test and a test they have already cleared, so a class that
   * carries no consequence produces no entry.
   */
  previousClassTest?: { passed: boolean } | null;
  reasonGiven: boolean;
  /** nexus_scheduled_classes.status. A cancelled class asks nothing. */
  classStatus?: string | null;
  /** From classStartIso. The +05:30 in that helper is load-bearing. */
  classStartIso: string;
  /** Injectable for tests. Defaults to now. */
  nowMs?: number;
}

export interface ClassPrepGateDecision {
  /** Was this class subject to the gate at all. */
  gated: boolean;
  /** May the join URL be handed over. */
  open: boolean;
  via: PrepUnlockVia;
  /** What is still outstanding, reported even when the door is open via a reason. */
  blockers: PrepBlocker[];
  /**
   * Fraction of what was asked that is done, 0 to 1. NULL when nothing was
   * asked. Never 0 in that case.
   */
  readiness: number | null;
}

/**
 * Did this attempt clear the bar.
 *
 * Must stay identical to resolvePassingPct + the grader in test-repository.ts:
 * `passingPct == null ? true : percentage >= passingPct`. If the two ever
 * disagree the student is shown "Passed, 82%" beside a locked Join button, which
 * reads as the app being broken rather than as a rule they can act on.
 */
export function prepTestPassed(bestPct: number | null, passingPct: number | null): boolean {
  if (passingPct == null) return bestPct != null;
  if (bestPct == null) return false;
  return bestPct >= passingPct;
}

export function decideClassPrepGate(input: ClassPrepGateInput): ClassPrepGateDecision {
  const openUngated = (via: PrepUnlockVia): ClassPrepGateDecision => ({
    gated: false,
    open: true,
    via,
    blockers: [],
    readiness: null,
  });

  // The flag is checked before anything else so that switching it off is a true
  // revert: no blockers computed, no readiness reported, nothing to render.
  if (!input.flagEnabled) return openUngated('flag_off');

  // Staff must always reach their own class, and a teacher using View-as-Student
  // must not be stopped by the thing they are inspecting.
  if (input.role !== 'student') return openUngated('not_required');
  if (input.impersonating) return openUngated('not_required');

  // A cancelled class asks nothing of anyone.
  if (input.classStatus === 'cancelled') return openUngated('not_required');

  const testRequired = input.test != null;
  const preworkRequired = input.prework.required > 0;
  const carriedOver = input.previousClassTest != null;

  // The overwhelmingly common case: no test, no prework, nothing carried over.
  // The response for these classes has to stay byte-identical to today, so
  // nothing is gated and nothing is reported.
  if (!testRequired && !preworkRequired && !carriedOver) return openUngated('not_required');

  // Outside the lead window there is no lock yet. One threshold for the whole
  // product: the same 180 minutes prework already uses to decide when to ask.
  // Two thresholds is how deadlines stop being believed.
  const now = input.nowMs ?? Date.now();
  const startMs = Date.parse(input.classStartIso);
  if (Number.isFinite(startMs) && now < startMs - PREP_GATE_LEAD_MINUTES * 60_000) {
    return { gated: true, open: true, via: 'not_yet_armed', blockers: [], readiness: null };
  }

  const blockers: PrepBlocker[] = [];
  // Test first. It is the longer job, so it is the one worth asking for while
  // there is still time to do it.
  if (testRequired && !prepTestPassed(input.test!.bestPct, input.test!.passingPct)) {
    blockers.push('test_not_passed');
  }
  // submitted > required happens when a teacher unlinks an assignment after a
  // student handed it in. Clears, rather than throwing or going negative.
  if (preworkRequired && input.prework.submitted < input.prework.required) {
    blockers.push('prework_missing');
  }
  // Last, because it is about the previous class rather than this one. A student
  // reading a list of what they owe should see this evening's work first.
  if (carriedOver && !input.previousClassTest!.passed) {
    blockers.push('class_test_pending');
  }

  const requiredCount = (testRequired ? 1 : 0) + input.prework.required + (carriedOver ? 1 : 0);
  const doneCount =
    (testRequired && !blockers.includes('test_not_passed') ? 1 : 0) +
    Math.min(input.prework.submitted, input.prework.required) +
    (carriedOver && input.previousClassTest!.passed ? 1 : 0);
  const readiness = requiredCount > 0 ? doneCount / requiredCount : null;

  if (blockers.length === 0) {
    return { gated: true, open: true, via: 'earned', blockers: [], readiness };
  }

  // The escape hatch. It opens the door and keeps the blockers, because the
  // teacher needs to know what is still outstanding and the student needs to get
  // to the teaching.
  if (input.reasonGiven) {
    return { gated: true, open: true, via: 'reason', blockers, readiness };
  }

  return { gated: true, open: false, via: 'earned', blockers, readiness };
}

export interface PrepBlockerCopy {
  title: string;
  lines: string[];
  primaryAction: 'take_test' | 'do_prework';
}

/**
 * What to show a blocked student.
 *
 * Returns null when the door is open, so no caller can accidentally render a
 * lock over a class the student may already join.
 */
export function prepBlockerCopy(decision: ClassPrepGateDecision): PrepBlockerCopy | null {
  if (decision.open || decision.blockers.length === 0) return null;

  const lines: string[] = [];
  if (decision.blockers.includes('test_not_passed')) lines.push('Pass the short test');
  if (decision.blockers.includes('prework_missing')) lines.push('Hand in the pre-class work');
  if (decision.blockers.includes('class_test_pending')) {
    lines.push('Finish the test from the last class');
  }

  return {
    // Counted rather than hard-coded to two, now that a third blocker exists.
    title:
      lines.length > 2
        ? `${lines.length} things before you join`
        : lines.length > 1
          ? 'Two things before you join'
          : 'One thing before you join',
    lines,
    primaryAction:
      decision.blockers.includes('test_not_passed') ||
      decision.blockers.includes('class_test_pending')
        ? 'take_test'
        : 'do_prework',
  };
}
