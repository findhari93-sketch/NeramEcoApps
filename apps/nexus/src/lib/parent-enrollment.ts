/**
 * The child's standing in their classroom, and the sentence that explains it.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * A parent reported that their child appeared in neither the "submitted" nor the
 * "not submitted" list for an assignment. Both lists were correct: the child was
 * dormant, and a dormant student is excluded from every roster metric on purpose
 * (see the header of migration 20260802090000, and getAssignmentRoster, which
 * drops them so a paused student cannot hold the class submission rate down
 * forever). Nothing in the parent portal said so, so the honest answer looked
 * like a bug.
 *
 * So this module does two jobs that belong together:
 *
 *   1. loadChildEnrollment is THE place a parent route learns the child's
 *      batch_id. Every parent class query must be scoped by it. Routing that
 *      through the same read that produces the notice means you cannot write a
 *      parent class query without also having the information needed to explain
 *      an empty one.
 *
 *   2. buildEnrollmentNotice turns the row into a sentence. Pure, so every
 *      branch is unit-testable, including the no-em-dash rule.
 *
 * The notice rides on EVERY parent API response. Four pages that each decided
 * for themselves whether to mention a paused enrolment is four chances to
 * disagree, and the parent would rightly trust none of them.
 */

import { getSupabaseAdminClient } from '@neram/database';

/** The subset of nexus_enrollments the parent portal reads. */
export interface ChildEnrollmentRow {
  id: string;
  batch_id: string | null;
  is_active: boolean | null;
  /** timestamptz */
  enrolled_at: string | null;
  removed_at: string | null;
  participation_status: string | null;
  /** date */
  dormant_since: string | null;
  dormant_reason: string | null;
}

export type EnrollmentNoticeKind = 'dormant' | 'removed' | 'late_joiner';

export interface EnrollmentNotice {
  kind: EnrollmentNoticeKind;
  tone: 'warning' | 'info' | 'neutral';
  headline: string;
  detail: string;
  /** 'YYYY-MM-DD', or null when the underlying column was never set. */
  sinceDate: string | null;
}

/**
 * A timestamptz or date string as an IST calendar day.
 *
 * Enrolment timestamps are instants; scheduled_date is a local IST day. Comparing
 * them without converting means a student enrolled at 21:00 IST on the 3rd looks
 * like they enrolled on the 3rd in IST and the 3rd in UTC, but one enrolled at
 * 06:00 IST on the 3rd was 00:30 UTC on the 3rd, and a naive slice(0, 10) of a
 * UTC ISO string silently reports the 2nd for anything before 05:30 IST.
 */
export function toIstDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // A bare 'YYYY-MM-DD' is already an IST calendar day. Feeding it through the
  // formatter would parse it as UTC midnight and shift it back a day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(ms);
}

/** "12 June" for the notice copy. Returns null rather than inventing a date. */
function friendlyDay(ymd: string | null): string | null {
  if (!ymd) return null;
  const ms = Date.parse(`${ymd}T00:00:00+05:30`);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

/** First name only. "Arun Kumar S" reads better as "Arun" in a sentence. */
function firstName(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Your child';
  return trimmed.split(/\s+/)[0];
}

/**
 * The child's live enrolment row for this classroom.
 *
 * Returns null when there is no row at all, which resolveChildContext should
 * already have caught. Callers treat null as "no scoping information", which
 * must mean "show nothing batch-specific", never "show everything".
 */
export async function loadChildEnrollment(
  childId: string,
  classroomId: string
): Promise<ChildEnrollmentRow | null> {
  const supabase = getSupabaseAdminClient();

  // participation_status, dormant_since, dormant_reason and dormant_by landed in
  // migration 20260802090000, after the last type generation, so they are absent
  // from database.generated.ts and PostgREST cannot infer this select. Same
  // documented `as any` pattern as nexus_class_absences in lib/parent-data.ts.
  // The real fix is `pnpm supabase:gen:types`, which is out of scope here: it
  // rewrites a shared package and rebuilds all four apps.
  const { data } = await (supabase.from('nexus_enrollments' as any) as any)
    .select(
      'id, batch_id, is_active, enrolled_at, removed_at, participation_status, dormant_since, dormant_reason'
    )
    .eq('user_id', childId)
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .order('is_active', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as ChildEnrollmentRow | null) ?? null;
}

/** The classroom's earliest class date, for deciding whether a child joined late. */
export async function loadClassroomFirstClassDate(
  classroomId: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();

  const { data } = await supabase
    .from('nexus_scheduled_classes')
    .select('scheduled_date')
    .eq('classroom_id', classroomId)
    .eq('publish_state', 'published')
    .order('scheduled_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data?.scheduled_date as string | undefined) ?? null;
}

/**
 * The sentence to show a parent about their child's standing, or null when the
 * child is simply active and there is nothing to explain.
 *
 * Precedence is removed, then dormant, then late_joiner. A removed student may
 * also carry a stale dormant flag, and leading with "paused" would suggest the
 * place is being held when it is not. A dormant student who also joined late
 * needs the dormant explanation, because that is the one suppressing numbers.
 *
 * Pure. Every string here is asserted against the em-dash rule in the tests.
 */
export function buildEnrollmentNotice(
  row: ChildEnrollmentRow | null,
  childName: string | null,
  firstClassDate?: string | null
): EnrollmentNotice | null {
  if (!row) return null;

  const who = firstName(childName);

  const removedOn = toIstDate(row.removed_at);
  if (row.is_active === false || removedOn) {
    const day = friendlyDay(removedOn);
    return {
      kind: 'removed',
      tone: 'neutral',
      headline: `${who}'s place in this class has ended`,
      detail: day
        ? `This ended on ${day}. The page below shows history only, so nothing new will appear here.`
        : 'The page below shows history only, so nothing new will appear here.',
      sinceDate: removedOn,
    };
  }

  if (row.participation_status === 'dormant') {
    const since = toIstDate(row.dormant_since);
    const day = friendlyDay(since);
    const opening = day
      ? `${who} has been marked paused in this class since ${day}.`
      : `${who} is marked paused in this class.`;
    return {
      kind: 'dormant',
      tone: 'warning',
      headline: `${who} is paused in this class`,
      detail:
        `${opening} While a student is paused they are left out of class lists, ` +
        'assignment totals and attendance reports, which is why some numbers on ' +
        'this page are empty. Please contact the office to start again.',
      sinceDate: since,
    };
  }

  const joinedOn = toIstDate(row.enrolled_at);
  if (joinedOn && firstClassDate && joinedOn > firstClassDate) {
    const day = friendlyDay(joinedOn);
    return {
      kind: 'late_joiner',
      tone: 'info',
      headline: `${who} joined this class on ${day || joinedOn}`,
      detail:
        'Classes held before that date are catch-up work rather than missed ' +
        'classes, so they are not counted against attendance.',
      sinceDate: joinedOn,
    };
  }

  return null;
}

/**
 * The enrolment row and its notice in one call, for routes that need both.
 *
 * The first-class lookup is skipped unless it could change the answer, so an
 * active on-time student costs one query rather than two.
 */
export async function loadEnrollmentContext(
  childId: string,
  classroomId: string,
  childName: string | null
): Promise<{ enrollment: ChildEnrollmentRow | null; notice: EnrollmentNotice | null }> {
  const enrollment = await loadChildEnrollment(childId, classroomId);
  if (!enrollment) return { enrollment: null, notice: null };

  const needsFirstClass =
    enrollment.is_active !== false &&
    !enrollment.removed_at &&
    enrollment.participation_status !== 'dormant';

  const firstClassDate = needsFirstClass
    ? await loadClassroomFirstClassDate(classroomId)
    : null;

  return {
    enrollment,
    notice: buildEnrollmentNotice(enrollment, childName, firstClassDate),
  };
}
