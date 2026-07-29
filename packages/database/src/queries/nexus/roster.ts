/**
 * The one written-down definition of "who counts towards this classroom's
 * numbers".
 *
 * Before this module the predicate
 *
 *   .eq('classroom_id', X).eq('role', 'student').eq('is_active', true)
 *
 * was copy-pasted inline in roughly 35 places, in three mutually inconsistent
 * variants: some also excluded alumni, some also day-scoped by enrolled_at, most
 * did neither. That is why the prep-roster readiness rate and the attendance
 * rate for the same class could legitimately disagree.
 *
 * Adding a fourth condition (participation_status) to 35 hand-written call sites
 * would have guaranteed the drift got worse, so the condition lives here once
 * and the call sites ask for it.
 *
 * It sits in @neram/database rather than apps/nexus/src/lib because three of the
 * mandated call sites (assignments.ts, library-engagement.ts, gamification.ts)
 * are inside this package, and packages cannot import from apps.
 *
 * WHAT THIS MODULE IS NOT: an access check. A dormant student keeps their Nexus
 * login, their Teams invites and their class notifications. Routes that answer
 * "is this person allowed in" must keep their own enrolment lookup and must NOT
 * be migrated to this helper. See migration 20260802090000.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusParticipationStatus, NexusStudyStage, NexusStudyStageSource } from '../../types';

/**
 * The `users` columns every caller gets. Extra ones are appended via
 * `userColumns`, never substituted, so `isTracked` can always read is_alumni.
 */
const BASE_USER_COLUMNS = 'id, name, email, avatar_url, ms_oid, is_alumni';

/**
 * The explicit FK hint is mandatory, not stylistic. nexus_enrollments references
 * users FOUR times (user_id, removed_by, dormant_by, current_standard_set_by),
 * so a bare `user:users(...)` embed is ambiguous and PostgREST rejects it. The
 * same trap is documented at api/students/inactivity/route.ts:40-44.
 */
const USER_FK = 'users!nexus_enrollments_user_id_fkey';

/** IST end-of-day, matching the literal already used by class-absences.ts. */
function endOfDayIst(date: string): string {
  return `${date}T23:59:59+05:30`;
}

export interface LoadRosterOptions {
  /**
   * Roster as it stood on this DATE (YYYY-MM-DD). Applies
   * `enrolled_at <= ${asOf}T23:59:59+05:30`, so a student who joined after the
   * class ran is not counted absent from it.
   */
  asOf?: string | null;
  /** Include dormant students. Default FALSE. Only the students screen passes true. */
  includeDormant?: boolean;
  /** Include graduated students. Default FALSE. */
  includeAlumni?: boolean;
  /** Include deactivated enrolments (is_active = false). Default FALSE. */
  includeRemoved?: boolean;
  /** Narrow to one classroom section (nexus_enrollments.batch_id). */
  batchId?: string | null;
  /** Extra `users` columns appended to the base embed, e.g. 'phone, personal_email'. */
  userColumns?: string;
  client?: TypedSupabaseClient;
}

export interface RosterMemberUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  ms_oid: string | null;
  is_alumni: boolean | null;
}

/**
 * `TUser` lets a caller that passed `userColumns` describe what it asked for,
 * e.g. loadClassroomRoster<RosterMemberUser & { personal_email: string | null }>.
 * The select string is built at runtime either way, so this is the same trust
 * boundary PostgREST queries always have; the generic just stops every such
 * caller from needing a cast.
 */
export interface RosterMember<TUser extends RosterMemberUser = RosterMemberUser> {
  enrollment_id: string;
  user_id: string;
  enrolled_at: string;
  batch_id: string | null;
  is_active: boolean;
  current_standard: NexusStudyStage | null;
  current_standard_source: NexusStudyStageSource | null;
  participation_status: NexusParticipationStatus;
  dormant_since: string | null;
  dormant_reason: string | null;
  user: TUser;
}

export interface ClassroomRoster<TUser extends RosterMemberUser = RosterMemberUser> {
  /** Every row that survived the options. Dormant included only when asked for. */
  members: RosterMember<TUser>[];
  /** user_ids of the TRACKED members, in `members` order. What most callers want. */
  ids: string[];
  /** user_ids of dormant members. Empty unless includeDormant. */
  dormantIds: string[];
  counts: { tracked: number; dormant: number; total: number };
}

/**
 * PURE. Does this enrolment count towards the classroom's numbers?
 *
 * This is the ONLY place the combination is written down. A second
 * implementation anywhere else is a bug, because the two will drift and then
 * two screens will disagree about the same class.
 */
export function isTracked(row: {
  is_active?: boolean | null;
  participation_status?: string | null;
  user?: { is_alumni?: boolean | null } | null;
}): boolean {
  if (!row) return false;
  if (row.is_active === false) return false;
  if (row.participation_status === 'dormant') return false;
  if (!row.user) return false;
  if (row.user.is_alumni === true) return false;
  return true;
}

/**
 * PURE. Split a caller-supplied id list into ids that may be messaged and ids
 * that must be dropped, given the enrolment rows we know about.
 *
 * The asymmetry here is deliberate and load-bearing. An id with NO student
 * enrolment row passes through UNCHANGED, because sendNudge is also given
 * PARENT ids (api/timetable/prework-escalations relies on exactly that, and says
 * so in a comment). An inner-join style filter would silently kill every parent
 * escalation.
 *
 * "Globally dormant" means: has at least one active student enrolment, and NONE
 * of them is participating. A student dormant in an archived classroom but
 * active in the current one is still reachable.
 */
export function pickTrackedIds(
  rows: { user_id: string; participation_status?: string | null }[],
  requestedIds: string[],
): { kept: string[]; dropped: string[] } {
  const anyActive = new Set<string>();
  const known = new Set<string>();
  for (const row of rows || []) {
    known.add(row.user_id);
    if (row.participation_status !== 'dormant') anyActive.add(row.user_id);
  }
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const id of requestedIds) {
    // Unknown id (parent, staff, stale) -> not ours to judge, let it through.
    if (!known.has(id) || anyActive.has(id)) kept.push(id);
    else dropped.push(id);
  }
  return { kept, dropped };
}

/**
 * Load one classroom's roster.
 *
 * `classroomId` may be null, meaning "every classroom": the library engagement
 * dashboard genuinely reports org-wide as well as per-class. Widening the
 * helper was the cheaper option, because the alternative was one more
 * hand-written copy of the predicate, which is exactly what this module exists
 * to end.
 *
 * The alumni exclusion is applied twice on purpose: once in the embed so the
 * index can help, and once in JS via isTracked. Three call sites in
 * assignments.ts already JS-filtered alumni precisely because the embedded
 * filter has proven unreliable, so this keeps both belts.
 */
export async function loadClassroomRoster<TUser extends RosterMemberUser = RosterMemberUser>(
  classroomId: string | null,
  options: LoadRosterOptions = {},
): Promise<ClassroomRoster<TUser>> {
  const {
    asOf = null,
    includeDormant = false,
    includeAlumni = false,
    includeRemoved = false,
    batchId = null,
    userColumns,
    client,
  } = options;

  const supabase = (client || getSupabaseAdminClient()) as any;

  const userSelect = userColumns ? `${BASE_USER_COLUMNS}, ${userColumns}` : BASE_USER_COLUMNS;
  const columns =
    'id, user_id, enrolled_at, batch_id, is_active, current_standard, ' +
    'current_standard_source, participation_status, dormant_since, dormant_reason, ' +
    `user:${USER_FK}${includeAlumni ? '' : '!inner'}(${userSelect})`;

  let query = supabase.from('nexus_enrollments').select(columns).eq('role', 'student');

  if (classroomId) query = query.eq('classroom_id', classroomId);
  if (!includeRemoved) query = query.eq('is_active', true);
  if (!includeAlumni) query = query.eq('users.is_alumni', false);
  if (!includeDormant) query = query.eq('participation_status', 'active');
  if (batchId) query = query.eq('batch_id', batchId);
  if (asOf) query = query.lte('enrolled_at', endOfDayIst(asOf));

  const { data, error } = await query;
  if (error) throw error;

  const members: RosterMember<TUser>[] = [];
  const ids: string[] = [];
  const dormantIds: string[] = [];

  for (const row of (data || []) as any[]) {
    if (!row.user) continue;
    // Defence in depth: the embedded alumni filter is not always honoured.
    if (!includeAlumni && row.user.is_alumni === true) continue;

    const member: RosterMember<TUser> = {
      enrollment_id: row.id,
      user_id: row.user_id,
      enrolled_at: row.enrolled_at,
      batch_id: row.batch_id ?? null,
      is_active: row.is_active !== false,
      current_standard: row.current_standard ?? null,
      current_standard_source: row.current_standard_source ?? null,
      participation_status: (row.participation_status ?? 'active') as NexusParticipationStatus,
      dormant_since: row.dormant_since ?? null,
      dormant_reason: row.dormant_reason ?? null,
      user: row.user,
    };
    members.push(member);
    if (isTracked(member)) ids.push(member.user_id);
    else if (member.participation_status === 'dormant') dormantIds.push(member.user_id);
  }

  return {
    members,
    ids,
    dormantIds,
    counts: { tracked: ids.length, dormant: dormantIds.length, total: members.length },
  };
}

/**
 * The reminder guard. Drop ids that resolve to a globally-dormant student, and
 * pass everything else through untouched.
 *
 * Called from sendNudge, which is the single choke point every student-facing
 * message routes through (prework-sweep, catchup-pace, assignment nudges,
 * catch-up nudges, study-material nudges). Several of those pass client-supplied
 * ids, so filtering at each roster query alone would leak.
 *
 * Read pickTrackedIds' doc comment before changing this: it also receives parent
 * ids, and dropping unknown ids would break parent escalations.
 */
export async function filterTrackedStudentIds(
  userIds: string[],
  client?: TypedSupabaseClient,
): Promise<{ kept: string[]; dropped: string[] }> {
  const unique = Array.from(new Set(userIds || []));
  if (!unique.length) return { kept: [], dropped: [] };

  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('user_id, participation_status')
    .eq('role', 'student')
    .eq('is_active', true)
    .in('user_id', unique);

  // Fail OPEN. A transient query failure must not silently mute every reminder
  // in the system; a nudge sent to a dormant student is a far smaller harm than
  // no nudge sent to anyone.
  if (error) {
    console.error('filterTrackedStudentIds lookup failed, passing all ids through:', error);
    return { kept: userIds, dropped: [] };
  }

  return pickTrackedIds((data || []) as any[], userIds);
}
