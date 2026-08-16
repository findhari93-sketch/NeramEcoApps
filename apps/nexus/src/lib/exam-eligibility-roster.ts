/**
 * Who a scheduled test is actually mandatory for, given which class(es) it
 * covers, and who is auto-excused: still catching up, or enrolled too
 * recently to have had a fair shot.
 *
 * PURE. The route does the batched I/O (see
 * packages/database/src/queries/nexus/exam-eligibility.ts) and hands the
 * facts here -- same split as class-prep-roster.ts, and for the same reason:
 * one place both the roster screen and its tests can trust.
 *
 * Two rules borrowed from class-prep-roster.ts, for the same reasons:
 *
 *   1. MISSING EVIDENCE IS NEVER "MANDATORY". A covered class with no
 *      attendance row and no absence row for a student (a data gap -- sync
 *      ran late, or never ran) falls to excused_pending_catchup, never to a
 *      mandatory bucket that would demand a test of someone the roster
 *      cannot actually vouch for.
 *
 *   2. AN OVERRIDE NEVER ERASES THE EVIDENCE. A teacher override always wins
 *      the final `bucket`, but `auto_bucket` and `evidence` stay populated
 *      underneath it, so the UI can show "auto-decided: X, teacher overrode
 *      to Y" instead of hiding what the system actually observed.
 *
 * NEW-JOINER RULE: enrolled after the EARLIEST covered class's date, not the
 * latest. Deliberately generous -- a student who joined between two covered
 * classes still missed part of the material through no fault of their own.
 */

export type EligibilityAutoBucket =
  | 'mandatory_attended'
  | 'mandatory_caught_up'
  | 'excused_pending_catchup'
  | 'excused_new_joiner';

export type EligibilityBucket =
  | EligibilityAutoBucket
  | 'teacher_override_mandatory'
  | 'teacher_override_excused';

export interface EligibilityCoveredClass {
  id: string;
  title: string | null;
  /** YYYY-MM-DD, IST wall-clock date, same convention as nexus_scheduled_classes.scheduled_date. */
  scheduled_date: string;
}

export interface EligibilityAbsenceFacts {
  kind: string;
  caught_up_at: string | null;
  excused_at: string | null;
}

export interface EligibilityClassEvidence {
  scheduled_class_id: string;
  title: string | null;
  scheduled_date: string;
  /** null means no attendance row at all was found for this student on this class. */
  attended: boolean | null;
  absence: EligibilityAbsenceFacts | null;
}

export interface EligibilityOverride {
  override: 'mandatory' | 'excused';
  note: string | null;
  set_by: string | null;
  set_at: string;
}

export interface EligibilityStudent {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  enrolled_at: string;
}

export interface EligibilityRosterRow {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  enrolled_at: string;
  bucket: EligibilityBucket;
  auto_bucket: EligibilityAutoBucket;
  is_mandatory: boolean;
  evidence: EligibilityClassEvidence[];
  override: EligibilityOverride | null;
}

export interface BuildEligibilityRosterInput {
  students: EligibilityStudent[];
  coveredClasses: EligibilityCoveredClass[];
  /** studentId -> scheduledClassId -> attended */
  attendance: Map<string, Map<string, boolean>>;
  /** studentId -> scheduledClassId -> absence facts */
  absences: Map<string, Map<string, EligibilityAbsenceFacts>>;
  overrides: Map<string, EligibilityOverride>;
}

const MANDATORY_AUTO_BUCKETS = new Set<EligibilityAutoBucket>(['mandatory_attended', 'mandatory_caught_up']);

/** IST wall-clock date from a timestamptz, matching splitLocalDateTime() in exams.ts. */
function toIstDate(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function earliestCoveredDate(classes: EligibilityCoveredClass[]): string | null {
  if (classes.length === 0) return null;
  return classes.reduce(
    (min, c) => (c.scheduled_date < min ? c.scheduled_date : min),
    classes[0].scheduled_date,
  );
}

function decideAutoBucket(
  student: EligibilityStudent,
  coveredClasses: EligibilityCoveredClass[],
  evidence: EligibilityClassEvidence[],
): EligibilityAutoBucket {
  // No linked classes: today's behaviour, unchanged. Every enrolled student
  // is mandatory, exactly as before this feature existed.
  if (coveredClasses.length === 0) return 'mandatory_attended';

  const earliest = earliestCoveredDate(coveredClasses);
  if (earliest && toIstDate(student.enrolled_at) > earliest) {
    return 'excused_new_joiner';
  }

  let attendedAny = false;
  let everyMissedCaughtUp = true;
  for (const e of evidence) {
    if (e.attended === true) {
      attendedAny = true;
      continue;
    }
    // Not attended -- either recorded absent, or no attendance row at all
    // (attended === null, a data gap). Either way it needs catch-up evidence
    // before this class can count as settled.
    const caughtUp = Boolean(e.absence?.caught_up_at || e.absence?.excused_at);
    if (!caughtUp) everyMissedCaughtUp = false;
  }

  if (attendedAny && everyMissedCaughtUp) return 'mandatory_attended';
  if (everyMissedCaughtUp) return 'mandatory_caught_up';
  return 'excused_pending_catchup';
}

export function buildExamEligibilityRoster(input: BuildEligibilityRosterInput): EligibilityRosterRow[] {
  return input.students.map((student) => {
    const evidence: EligibilityClassEvidence[] = input.coveredClasses.map((cls) => ({
      scheduled_class_id: cls.id,
      title: cls.title,
      scheduled_date: cls.scheduled_date,
      attended: input.attendance.get(student.student_id)?.get(cls.id) ?? null,
      absence: input.absences.get(student.student_id)?.get(cls.id) ?? null,
    }));

    const auto_bucket = decideAutoBucket(student, input.coveredClasses, evidence);
    const override = input.overrides.get(student.student_id) ?? null;

    const bucket: EligibilityBucket = override
      ? override.override === 'mandatory'
        ? 'teacher_override_mandatory'
        : 'teacher_override_excused'
      : auto_bucket;

    const is_mandatory =
      bucket === 'teacher_override_mandatory'
        ? true
        : bucket === 'teacher_override_excused'
          ? false
          : MANDATORY_AUTO_BUCKETS.has(bucket as EligibilityAutoBucket);

    return {
      student_id: student.student_id,
      name: student.name,
      avatar_url: student.avatar_url,
      enrolled_at: student.enrolled_at,
      bucket,
      auto_bucket,
      is_mandatory,
      evidence,
      override,
    };
  });
}

export interface EligibilityRosterSummary {
  mandatory: number;
  excusedPendingCatchup: number;
  excusedNewJoiner: number;
  overridden: number;
  total: number;
}

/**
 * mandatory/excusedPendingCatchup/excusedNewJoiner are mutually exclusive and
 * sum with any row that is neither (there is none, every row lands in one of
 * the three) to `total`. `overridden` is informational and NOT exclusive of
 * the others -- an overridden row is still counted under whichever of the
 * three its final bucket landed in, so a teacher can see both "how many must
 * sit it" and "how many of those are there because I said so".
 */
export function summariseEligibilityRoster(rows: EligibilityRosterRow[]): EligibilityRosterSummary {
  let mandatory = 0;
  let excusedPendingCatchup = 0;
  let excusedNewJoiner = 0;
  let overridden = 0;

  for (const row of rows) {
    if (row.override) overridden += 1;

    if (row.is_mandatory) {
      mandatory += 1;
    } else if (row.bucket === 'excused_new_joiner') {
      excusedNewJoiner += 1;
    } else {
      // excused_pending_catchup, or teacher_override_excused overriding an
      // auto_bucket that was not one of the two named excused buckets --
      // either way this is "excused, not for the new-joiner reason".
      excusedPendingCatchup += 1;
    }
  }

  return { mandatory, excusedPendingCatchup, excusedNewJoiner, overridden, total: rows.length };
}
