/**
 * Class Standing: one number, 0 to 100, for how a student is doing.
 *
 * PURE TypeScript (no JSX, no Supabase, no Date.now) so the same rules run on
 * the server, in the parent portal, and in unit tests. `today` is injected for
 * the same reason. Modelled on ./inactivity-score.ts, which solves the mirror
 * problem.
 *
 * ---------------------------------------------------------------------------
 * A NULL COMPONENT NEVER CONTRIBUTES ZERO. THIS IS THE MOST IMPORTANT RULE HERE.
 *
 * Every component can come back null, meaning "we did not measure this", which
 * is a completely different statement from "they scored nothing". Attendance
 * sync runs on a delegated Microsoft token and fails wholesale, so a classroom
 * nobody synced has no attendance at all; a class with no tests set has no test
 * scores; a student who never missed a class owes no catch-up.
 *
 * So the weights RENORMALISE. If attendance is unmeasured, the remaining 70
 * points of weight are scaled back up to 100 and the score is computed from
 * those alone. Treating a null as a zero would mark a student down for our
 * infrastructure failing, or for their teacher not having set a test yet.
 * ---------------------------------------------------------------------------
 *
 * NO RANK, NO CLASS AVERAGE, NO LEADERBOARD. Deliberately absent from this
 * module and from its output type. This is a support tool that a parent sees;
 * the moment it carries a position in the class it becomes a competition, and
 * the conversation stops being about the child.
 *
 * WHAT IS DELIBERATELY EXCLUDED, and why:
 *   login recency     measures administrative compliance, not learning
 *   profile photo     same, and a parent should not see their child marked
 *                     down for not uploading a passport photo
 *   assignment marks  a mark only exists once a teacher reviews. Counting it
 *                     would penalise a student for sitting in a grading queue.
 *                     It is reported in the breakdown, labelled as not scored.
 *
 * House rule, asserted in the tests: no string here contains an em dash, a
 * double dash, or &mdash;.
 */

export type ClassStandingBand =
  | 'excelling'
  | 'on_track'
  | 'needs_support'
  | 'at_risk'
  | 'settling_in'
  | 'not_enough_data';

export type ClassStandingKey =
  | 'attendance'
  | 'assignments'
  | 'tests'
  | 'catchup'
  | 'punctuality';

export type StandingAudience = 'staff' | 'parent';

/** A student newer than this is not judged at all. */
export const CLASS_STANDING_GRACE_DAYS = 14;

/**
 * The evidence floor. Below this we say so rather than invent a number.
 *
 * These are deliberately not 1. An early version used a floor of one
 * assignment, and against real data it branded a student "At Risk, worth
 * contacting the family" because a single piece of work was outstanding in a
 * classroom with no attendance synced and no tests set. One missed assignment
 * is an incident; three is a pattern, and only a pattern is worth a phone call.
 *
 * A number that cries wolf is worse than no number, because the teacher learns
 * to ignore it and then misses the student who really is in trouble. Same
 * reasoning as the new-joiner grace in ./inactivity-score.ts.
 */
export const MIN_MEASURED_CLASSES = 3;
export const MIN_APPLICABLE_ASSIGNMENTS = 3;

/** Nominal weights. Must total 100. */
export const STANDING_WEIGHTS: Record<ClassStandingKey, number> = {
  attendance: 30,
  assignments: 25,
  tests: 20,
  catchup: 15,
  punctuality: 10,
};

export const STANDING_LABEL: Record<ClassStandingKey, string> = {
  attendance: 'Attendance',
  assignments: 'Assignments',
  tests: 'Tests',
  catchup: 'Catching up',
  punctuality: 'Punctuality',
};

const BAND_LABEL: Record<ClassStandingBand, Record<StandingAudience, string>> = {
  excelling: { staff: 'Excelling', parent: 'Excelling' },
  on_track: { staff: 'On Track', parent: 'On Track' },
  needs_support: { staff: 'Needs Support', parent: 'Needs Support' },
  // The only wording that differs by audience. Same band, same number: a parent
  // needs to know it is serious without being told their child is a risk.
  at_risk: { staff: 'At Risk', parent: 'Needs Support Now' },
  settling_in: { staff: 'Settling In', parent: 'Settling In' },
  not_enough_data: { staff: 'Not Enough Data', parent: 'Not Enough Data Yet' },
};

export interface ClassStandingComponent {
  key: ClassStandingKey;
  label: string;
  /** Nominal weight out of 100. */
  weight: number;
  /** Weight after renormalisation. 0 when unmeasured. */
  effectiveWeight: number;
  /** 0 to 100, or null when not measured. */
  score: number | null;
  /** Points this component contributed to the total. null when unmeasured. */
  contribution: number | null;
  measured: boolean;
  /** Staff wording. */
  evidence: string;
  /** Parent wording, supportive, same facts. */
  parentEvidence: string;
}

export interface ClassStandingResult {
  /** 0 to 100, or null for settling_in and not_enough_data. */
  score: number | null;
  band: ClassStandingBand;
  bandLabel: string;
  headline: string;
  detail: string;
  /** ALWAYS all five, in weight order, including the unmeasured ones. */
  components: ClassStandingComponent[];
  /** Keys of the components we could not measure. */
  unavailable: ClassStandingKey[];
  windowDays: number;
  /** The injected `today`, so a stored result can be read back honestly. */
  computedFor: string;
}

export interface ClassStandingSignals {
  /** ISO. Drives the new-joiner grace only. */
  enrolledAt: string | null;
  /** YYYY-MM-DD or ISO. Injected to keep this pure. */
  today: string;
  windowDays: number;

  attendance: {
    /** Classes that actually have attendance rows for someone on the roster. */
    measuredClasses: number;
    attended: number;
    /** Absences a teacher excused. These leave the denominator entirely. */
    excusedByTeacher: number;
    /** Absences the student or parent explained. Half credit. */
    selfExplained: number;
  } | null;

  assignments: {
    applicable: number;
    submitted: number;
    onTime: number;
    /** Reported in the breakdown, never scored. See the header. */
    avgMarksPct: number | null;
  } | null;

  tests: {
    /** Tests old enough to judge, see TEST_GRACE_DAYS at the call site. */
    total: number;
    attempted: number;
    /** Mean best score across attempted tests. null when none attempted. */
    averageBestPct: number | null;
  } | null;

  catchup: {
    total: number;
    done: number;
    excused: number;
  } | null;

  punctuality: {
    /** Measured classes the student actually attended. */
    attendedClasses: number;
    /** Of those, the ones with no late join, early leave or mid-class drop. */
    cleanClasses: number;
  } | null;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function daysBetween(fromIso: string | null, toIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}

interface RawComponent {
  key: ClassStandingKey;
  score: number | null;
  evidence: string;
  parentEvidence: string;
}

/** Attendance, 30. Teacher-excused absences leave the denominator entirely. */
function scoreAttendance(s: ClassStandingSignals['attendance']): RawComponent {
  const key: ClassStandingKey = 'attendance';
  if (!s || s.measuredClasses <= 0) {
    return {
      key,
      score: null,
      evidence: 'No attendance has been recorded for this period.',
      parentEvidence:
        'We have not recorded attendance for this period, so it is not part of this number.',
    };
  }

  // A staff member made a judgement about these, so the score respects it.
  const denominator = s.measuredClasses - s.excusedByTeacher;
  if (denominator <= 0) {
    return {
      key,
      score: null,
      evidence: 'Every recorded absence in this period was excused.',
      parentEvidence: 'Every class missed in this period was excused, so nothing counts against them.',
    };
  }

  // Half credit for a self-declared reason: it softens the mark without making
  // absence free, which would be gameable.
  const credited = s.attended + 0.5 * s.selfExplained;
  const score = clampPct((credited / denominator) * 100);

  return {
    key,
    score,
    evidence: `Attended ${s.attended} of ${denominator} recorded classes.`,
    parentEvidence: `They were in ${s.attended} of the ${denominator} classes we recorded.`,
  };
}

/** Assignments, 25. Marks are excluded on purpose, see the file header. */
function scoreAssignments(s: ClassStandingSignals['assignments']): RawComponent {
  const key: ClassStandingKey = 'assignments';
  if (!s || s.applicable <= 0) {
    return {
      key,
      score: null,
      evidence: 'No assignment has come due for this student yet.',
      parentEvidence:
        'No assignment has come due for them yet, so it is not part of this number.',
    };
  }

  const submissionRate = Math.min(1, s.submitted / s.applicable);
  const onTimeRate = s.submitted > 0 ? s.onTime / s.submitted : 0;
  const score = clampPct((0.7 * submissionRate + 0.3 * onTimeRate) * 100);

  return {
    key,
    score,
    evidence: `Submitted ${s.submitted} of ${s.applicable}, ${s.onTime} on time.`,
    parentEvidence: `They have handed in ${s.submitted} of ${s.applicable} pieces of work, ${s.onTime} of them on time.`,
  };
}

/** Tests, 20. Participation and result, weighted towards the result. */
function scoreTests(s: ClassStandingSignals['tests']): RawComponent {
  const key: ClassStandingKey = 'tests';
  if (!s || s.total <= 0) {
    return {
      key,
      score: null,
      evidence: 'No test has been set for this class yet.',
      parentEvidence: 'No test has been set for this class yet, so it is not part of this number.',
    };
  }

  const participation = s.attempted / s.total;
  const score = clampPct(0.4 * participation * 100 + 0.6 * (s.averageBestPct ?? 0));

  return {
    key,
    score,
    evidence:
      s.attempted === 0
        ? `Has not attempted any of the ${s.total} tests set.`
        : `Attempted ${s.attempted} of ${s.total}, averaging ${Math.round(s.averageBestPct ?? 0)}%.`,
    parentEvidence:
      s.attempted === 0
        ? `They have not yet tried any of the ${s.total} tests set.`
        : `They have taken ${s.attempted} of ${s.total} tests, averaging ${Math.round(
            s.averageBestPct ?? 0,
          )}%.`,
  };
}

/**
 * Catching up, 15.
 *
 * Null when nothing is owed, NOT 100. A student with perfect attendance owes no
 * catch-up, and awarding them full marks here would count their attendance
 * twice.
 */
function scoreCatchup(s: ClassStandingSignals['catchup']): RawComponent {
  const key: ClassStandingKey = 'catchup';
  const owed = s ? s.total - s.excused : 0;

  if (!s || owed <= 0) {
    return {
      key,
      score: null,
      evidence: 'Nothing to catch up on in this period.',
      parentEvidence: 'There is nothing to catch up on, so it is not part of this number.',
    };
  }

  const score = clampPct((s.done / owed) * 100);
  return {
    key,
    score,
    evidence: `Cleared ${s.done} of ${owed} missed classes.`,
    parentEvidence: `They have caught up on ${s.done} of the ${owed} classes they missed.`,
  };
}

/**
 * Punctuality, 10.
 *
 * Split from attendance because one number cannot tell apart a student who
 * attended every class on time from one who joined every class 25 minutes late.
 */
function scorePunctuality(s: ClassStandingSignals['punctuality']): RawComponent {
  const key: ClassStandingKey = 'punctuality';
  if (!s || s.attendedClasses <= 0) {
    return {
      key,
      score: null,
      evidence: 'No attended class in this period to judge punctuality on.',
      parentEvidence: 'There are no attended classes to judge this on yet.',
    };
  }

  const score = clampPct((s.cleanClasses / s.attendedClasses) * 100);
  const ragged = s.attendedClasses - s.cleanClasses;

  return {
    key,
    score,
    evidence:
      ragged === 0
        ? `Present for the whole of all ${s.attendedClasses} classes attended.`
        : `Joined late or left early in ${ragged} of ${s.attendedClasses} classes.`,
    parentEvidence:
      ragged === 0
        ? `They stayed for the whole of every class they attended.`
        : `They joined late or left early in ${ragged} of ${s.attendedClasses} classes.`,
  };
}

function bandFor(score: number): ClassStandingBand {
  if (score >= 85) return 'excelling';
  if (score >= 70) return 'on_track';
  if (score >= 50) return 'needs_support';
  return 'at_risk';
}

/**
 * The always-five component list for a no-score outcome.
 *
 * Every component reports `measured: false` and no percentage, even one that
 * had a number available. In `settling_in` and `not_enough_data` we are
 * explicitly declining to judge, so showing "Assignments 0%" beside "0% of the
 * score" would contradict the headline and read as a judgement after all. The
 * evidence sentence is kept, because "submitted 0 of 1" is a useful fact even
 * when it is not enough to score.
 */
function inertComponents(raw: RawComponent[]): ClassStandingComponent[] {
  return raw.map((r) => ({
    key: r.key,
    label: STANDING_LABEL[r.key],
    weight: STANDING_WEIGHTS[r.key],
    effectiveWeight: 0,
    score: null,
    contribution: null,
    measured: false,
    evidence: r.evidence,
    parentEvidence: r.parentEvidence,
  }));
}

export function computeClassStanding(
  signals: ClassStandingSignals,
  audience: StandingAudience = 'staff',
): ClassStandingResult {
  const raw: RawComponent[] = [
    scoreAttendance(signals.attendance),
    scoreAssignments(signals.assignments),
    scoreTests(signals.tests),
    scoreCatchup(signals.catchup),
    scorePunctuality(signals.punctuality),
  ];

  const base = {
    windowDays: signals.windowDays,
    computedFor: signals.today,
    unavailable: raw.filter((r) => r.score === null).map((r) => r.key),
  };

  // A student who joined last week has not had time to do anything, and marking
  // them At Risk teaches everyone to ignore the number.
  const daysEnrolled = daysBetween(signals.enrolledAt, signals.today);
  if (daysEnrolled !== null && daysEnrolled < CLASS_STANDING_GRACE_DAYS) {
    return {
      ...base,
      score: null,
      band: 'settling_in',
      bandLabel: BAND_LABEL.settling_in[audience],
      headline: 'Settling in',
      detail:
        audience === 'parent'
          ? 'They joined recently, so there is not enough yet to judge how they are getting on. This will fill in over the next couple of weeks.'
          : 'Joined within the last two weeks, so the standing is not calculated yet.',
      components: inertComponents(raw),
    };
  }

  const measured = raw.filter((r) => r.score !== null);
  const availableWeight = measured.reduce((sum, r) => sum + STANDING_WEIGHTS[r.key], 0);

  // Not enough evidence: say so rather than invent a number from one data point.
  const thinAttendance =
    !signals.attendance || signals.attendance.measuredClasses < MIN_MEASURED_CLASSES;
  const thinAssignments =
    !signals.assignments || signals.assignments.applicable < MIN_APPLICABLE_ASSIGNMENTS;

  if (availableWeight === 0 || (thinAttendance && thinAssignments)) {
    return {
      ...base,
      score: null,
      band: 'not_enough_data',
      bandLabel: BAND_LABEL.not_enough_data[audience],
      headline: 'Not enough to go on yet',
      detail:
        audience === 'parent'
          ? 'We do not have enough recorded yet to give a fair picture. It will appear once there are a few more classes and assignments.'
          : 'Too few measured classes and assignments to compute a standing.',
      components: inertComponents(raw),
    };
  }

  // Renormalise. THE rule: a null contributes nothing and takes its weight with
  // it, rather than dragging the score down as if it were a zero.
  const total = Math.round(
    measured.reduce((sum, r) => sum + (r.score as number) * STANDING_WEIGHTS[r.key], 0) /
      availableWeight,
  );

  const components: ClassStandingComponent[] = raw.map((r) => {
    if (r.score === null) {
      return {
        key: r.key,
        label: STANDING_LABEL[r.key],
        weight: STANDING_WEIGHTS[r.key],
        effectiveWeight: 0,
        score: null,
        contribution: null,
        measured: false,
        evidence: r.evidence,
        parentEvidence: r.parentEvidence,
      };
    }
    const effectiveWeight = (STANDING_WEIGHTS[r.key] / availableWeight) * 100;
    return {
      key: r.key,
      label: STANDING_LABEL[r.key],
      weight: STANDING_WEIGHTS[r.key],
      effectiveWeight: Math.round(effectiveWeight),
      score: Math.round(r.score),
      contribution: Math.round((r.score * effectiveWeight) / 100),
      measured: true,
      evidence: r.evidence,
      parentEvidence: r.parentEvidence,
    };
  });

  const band = bandFor(total);

  return {
    ...base,
    score: total,
    band,
    bandLabel: BAND_LABEL[band][audience],
    headline: headlineFor(band, audience),
    detail: detailFor(band, audience, base.unavailable),
    components,
  };
}

function headlineFor(band: ClassStandingBand, audience: StandingAudience): string {
  const staff: Record<string, string> = {
    excelling: 'Doing very well',
    on_track: 'On track',
    needs_support: 'Could use support',
    at_risk: 'Needs attention now',
  };
  const parent: Record<string, string> = {
    excelling: 'Doing very well',
    on_track: 'On track',
    needs_support: 'Could use a little support',
    at_risk: 'Needs support right now',
  };
  return (audience === 'parent' ? parent : staff)[band] ?? 'Standing';
}

function detailFor(
  band: ClassStandingBand,
  audience: StandingAudience,
  unavailable: ClassStandingKey[],
): string {
  const staff: Record<string, string> = {
    excelling: 'Attending, submitting and keeping up across the board.',
    on_track: 'Keeping up. Nothing here needs chasing.',
    needs_support: 'Slipping on at least one front. Worth a conversation.',
    at_risk: 'Falling behind on several fronts. Worth contacting the family.',
  };
  const parent: Record<string, string> = {
    excelling: 'They are attending, handing work in and keeping up.',
    on_track: 'They are keeping up with the class.',
    needs_support: 'They are keeping going, but slipping in one or two areas.',
    at_risk: 'They are falling behind in several areas and could use help at home.',
  };

  const sentence = (audience === 'parent' ? parent : staff)[band] ?? '';
  if (unavailable.length === 0) return sentence;

  // Naming what was left out is the difference between a number you can argue
  // with and one you have to take on faith.
  const names = unavailable.map((k) => STANDING_LABEL[k].toLowerCase());
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${sentence} Not counted: ${list}, because we have nothing recorded there.`;
}

/** Display colour per band. Never the only signal, always beside the label. */
export const BAND_COLOR: Record<ClassStandingBand, string> = {
  excelling: '#2E7D32',
  on_track: '#1565C0',
  needs_support: '#B8860B',
  at_risk: '#C62828',
  settling_in: '#6B7280',
  not_enough_data: '#6B7280',
};

/**
 * Map a standing band onto the parent portal's older verdict vocabulary.
 *
 * Kept for one release so the existing chip colours on the parent dashboard
 * keep working while the two are swapped over. Delete once nothing reads
 * `verdict`.
 */
export function toLegacyVerdictBand(
  band: ClassStandingBand,
): 'on_track' | 'slipping' | 'needs_attention' | 'not_enough_data' {
  switch (band) {
    case 'excelling':
    case 'on_track':
      return 'on_track';
    case 'needs_support':
      return 'slipping';
    case 'at_risk':
      return 'needs_attention';
    default:
      return 'not_enough_data';
  }
}
