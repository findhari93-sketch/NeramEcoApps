/**
 * Nexus staff capabilities: the single source of truth for what each staff tier
 * may do.
 *
 * Motivation: before this module, `teacher` and `admin` were interchangeable
 * across ~330 of ~354 API routes, so a visiting teacher could remove students
 * from the classroom, delete a batch (unassigning everyone in it) or unlink the
 * Microsoft Teams team. Meanwhile the office coordinator had to be made a full
 * `admin` just to do data entry, which also handed her feature flags, role
 * changes and impersonation.
 *
 * Two dimensions, deliberately orthogonal:
 *
 *   staff_role  how much authority        admin | manager | teacher
 *   can_teach   may stand in front of a class (boolean)
 *
 * Keeping them separate is what lets a non-teaching manager hold every
 * operational power while never being offered as a class tutor, and lets a new
 * office hire or a new visiting teacher be onboarded with no code change.
 *
 * Note this module does NOT read `user_type`, except as a fallback in
 * resolveStaffRole(). `user_type` gates the Admin app (admin.neramclasses.com);
 * `staff_role` gates Nexus. A person can legitimately be `user_type='admin'`
 * (full CRM rights) and `staff_role='manager'` (restricted inside Nexus).
 *
 * This module is PURE TypeScript (no JSX, no next/navigation, no DB access) so
 * it can be imported from both the server (/api/auth/me, route guards) and the
 * client (nav providers, CapabilityGate), exactly like feature-flags.ts.
 *
 * Feature flags and capabilities are different things and compose:
 *   feature flag = "is this feature switched on for everyone yet?" (rollout)
 *   capability    = "is this person allowed to do it?"             (authority)
 */

// Type-only import, erased at compile time, so this module stays runtime-pure
// and safe to import from client components. Aliasing rather than redeclaring
// means users.staff_role has exactly ONE definition and the two cannot drift.
import type { StaffRole as DbStaffRole } from '@neram/database';

export type StaffRole = DbStaffRole;

export const STAFF_ROLES: readonly StaffRole[] = ['admin', 'manager', 'teacher'];

/** Human labels for the role pickers and audit copy. */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  teacher: 'Teacher',
};

export const STAFF_ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: 'Full control, including system settings, roles and feature flags.',
  manager: 'Internal team. Every operational power across all classes, but no system settings.',
  teacher: 'Teaching and grading, limited to the classes they are the tutor of.',
};

/**
 * Every gated action in Nexus.
 *
 * Naming is `group.action`, and the groups carry meaning:
 *   system.*     irreversible or tenant-wide configuration. Admin only.
 *   structure.*  the shape of the cohort: classrooms, batches, enrolments, plans.
 *   teach.*      running and authoring classes.
 *   moderate.*   acting on student-generated content.
 *   coord.*      chasing, checking and recording students. The office work.
 *   report.*     read-only dashboards.
 */
export type Capability =
  // ── system: admin only ─────────────────────────────────────────────────────
  | 'system.roles'
  | 'system.feature_flags'
  | 'system.settings'
  | 'system.review_platforms'
  // ── structure ──────────────────────────────────────────────────────────────
  | 'structure.classroom.create'
  | 'structure.classroom.delete'
  | 'structure.classroom.teams_link'
  | 'structure.batch.manage'
  | 'structure.enrollment.add'
  | 'structure.enrollment.remove'
  | 'structure.plan.delete'
  // ── teaching ───────────────────────────────────────────────────────────────
  | 'teach.timetable.schedule'
  | 'teach.tutor'
  | 'teach.session.run'
  | 'teach.content.author'
  | 'teach.assignment.write'
  | 'teach.grade'
  | 'teach.attendance.mark'
  | 'teach.recap.publish'
  // ── moderation ─────────────────────────────────────────────────────────────
  | 'moderate.comments'
  | 'moderate.gallery'
  | 'moderate.recall'
  // ── coordination ───────────────────────────────────────────────────────────
  | 'coord.student.view'
  | 'coord.attendance.view'
  | 'coord.nudge'
  | 'coord.watchlist'
  | 'coord.photo_review'
  | 'coord.photo_ms_push'
  | 'coord.document.verify'
  | 'coord.review_campaign'
  | 'coord.issue.triage'
  // ── other ──────────────────────────────────────────────────────────────────
  | 'impersonate.any'
  | 'report.view';

/**
 * Capabilities every staff tier holds, including a visiting teacher.
 *
 * `teach.session.run`, `teach.grade`, `teach.attendance.mark` and
 * `coord.attendance.view` appear here but are additionally SESSION-SCOPED for
 * the `teacher` tier at the call site (see assertSessionAccess in
 * ./staff-scope). Holding the capability answers "may you do this at all"; the
 * scope check answers "to which class". Internal staff pass the scope check
 * unconditionally.
 */
const SHARED_STAFF: readonly Capability[] = [
  'teach.session.run',
  'teach.content.author',
  'teach.assignment.write',
  'teach.grade',
  'teach.attendance.mark',
  'teach.recap.publish',
  'moderate.comments',
  'moderate.gallery',
  'moderate.recall',
  'coord.student.view',
  'coord.attendance.view',
  'coord.nudge',
  'coord.watchlist',
  'coord.photo_review',
  'coord.document.verify',
  'coord.review_campaign',
  'coord.issue.triage',
  'report.view',
];

/**
 * What a manager adds on top of SHARED_STAFF: the whole operational surface,
 * across every class, minus system configuration.
 *
 * `structure.classroom.delete` is deliberately NOT here. Deleting a classroom
 * detaches an entire cohort and there is no undo in the UI, so it stays with
 * the admin.
 */
const MANAGER_EXTRA: readonly Capability[] = [
  'structure.classroom.create',
  'structure.classroom.teams_link',
  'structure.batch.manage',
  'structure.enrollment.add',
  'structure.enrollment.remove',
  'structure.plan.delete',
  'teach.timetable.schedule',
  'coord.photo_ms_push',
  'impersonate.any',
];

const ADMIN_EXTRA: readonly Capability[] = [
  'system.roles',
  'system.feature_flags',
  'system.settings',
  'system.review_platforms',
  'structure.classroom.delete',
];

/**
 * role -> capability set. Note `teach.tutor` is absent from every entry on
 * purpose: it is not granted by the tier at all, it is granted by can_teach.
 * See can() below.
 */
export const ROLE_CAPABILITIES: Record<StaffRole, ReadonlySet<Capability>> = {
  teacher: new Set<Capability>(SHARED_STAFF),
  manager: new Set<Capability>([...SHARED_STAFF, ...MANAGER_EXTRA]),
  admin: new Set<Capability>([...SHARED_STAFF, ...MANAGER_EXTRA, ...ADMIN_EXTRA]),
};

/** The shape can()/resolveStaffRole() need. Matches both a DB row and RequestUser. */
export interface StaffRoleSource {
  user_type?: string | null;
  staff_role?: string | null;
  can_teach?: boolean | null;
}

function isStaffRole(value: unknown): value is StaffRole {
  return value === 'admin' || value === 'manager' || value === 'teacher';
}

/**
 * The effective Nexus tier for a user row.
 *
 * Prefers `staff_role`, and falls back to `user_type` when it is null so that
 * nothing breaks mid-rollout: a staff row the backfill has not reached yet keeps
 * exactly the authority it had before this module existed. Returns null for
 * students, leads and parents, which every capability check treats as "no".
 *
 * The fallback intentionally maps user_type='admin' to the admin tier. That is
 * why the migration must set staff_role='manager' EXPLICITLY for the internal
 * team, rather than relying on the derived default.
 */
export function resolveStaffRole(user: StaffRoleSource | null | undefined): StaffRole | null {
  if (!user) return null;
  if (isStaffRole(user.staff_role)) return user.staff_role;
  if (user.user_type === 'admin') return 'admin';
  if (user.user_type === 'teacher') return 'teacher';
  return null;
}

/** admin or manager: the internal core team, who see and act across ALL classes. */
export function isInternalStaff(role: StaffRole | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/** Any staff tier at all. Replaces the old `teacher || admin` idiom. */
export function isStaffRoleAny(role: StaffRole | null | undefined): boolean {
  return isStaffRole(role);
}

/**
 * Does this role hold this capability? Fail-closed: a null role, an unknown
 * role, or a capability absent from the set all return false.
 *
 * `teach.tutor` is special. It is not a tier capability but a per-person flag,
 * so it is answered from can_teach. A manager with can_teach=false keeps every
 * other manager capability and only loses the tutor slot; a visiting teacher
 * with can_teach=false is likewise never offered as tutor. Pass canTeach
 * explicitly, or use canUser() which reads it off the row.
 */
export function can(
  role: StaffRole | null | undefined,
  capability: Capability,
  canTeach: boolean = true,
): boolean {
  if (!isStaffRole(role)) return false;
  if (capability === 'teach.tutor') return canTeach !== false;
  return ROLE_CAPABILITIES[role].has(capability);
}

/** can() applied straight to a user row, reading both staff_role and can_teach. */
export function canUser(user: StaffRoleSource | null | undefined, capability: Capability): boolean {
  return can(resolveStaffRole(user), capability, user?.can_teach !== false);
}

/**
 * Whether this person may be assigned as the tutor of a scheduled class.
 * The single gate behind the Add-Class tutor picker and any write to
 * nexus_scheduled_classes.teacher_id.
 */
export function canTutor(user: StaffRoleSource | null | undefined): boolean {
  return canUser(user, 'teach.tutor');
}

/**
 * May this person act on ONE specific class: wrap it up, mark its register,
 * attach its assignments, publish its recap.
 *
 * Internal staff: any class. External teacher: only a class they are the tutor
 * of. Non-staff: never.
 *
 * Pure, so the per-class routes can call it once they have the class row; the
 * database-backed equivalent for routes that only have an id is
 * assertSessionAccess in ./staff-scope.
 */
export function canRunSession(
  user: (StaffRoleSource & { id?: string | null }) | null | undefined,
  classTeacherId: string | null | undefined,
): boolean {
  const role = resolveStaffRole(user);
  if (role === null) return false;
  if (isInternalStaff(role)) return true;
  return !!classTeacherId && !!user?.id && classTeacherId === user.id;
}

/** Every capability in the union, for building a complete resolved map. */
export const ALL_CAPABILITIES: readonly Capability[] = [
  'system.roles',
  'system.feature_flags',
  'system.settings',
  'system.review_platforms',
  'structure.classroom.create',
  'structure.classroom.delete',
  'structure.classroom.teams_link',
  'structure.batch.manage',
  'structure.enrollment.add',
  'structure.enrollment.remove',
  'structure.plan.delete',
  'teach.timetable.schedule',
  'teach.tutor',
  'teach.session.run',
  'teach.content.author',
  'teach.assignment.write',
  'teach.grade',
  'teach.attendance.mark',
  'teach.recap.publish',
  'moderate.comments',
  'moderate.gallery',
  'moderate.recall',
  'coord.student.view',
  'coord.attendance.view',
  'coord.nudge',
  'coord.watchlist',
  'coord.photo_review',
  'coord.photo_ms_push',
  'coord.document.verify',
  'coord.review_campaign',
  'coord.issue.triage',
  'impersonate.any',
  'report.view',
];

export type CapabilityMap = Record<Capability, boolean>;

/**
 * A fully resolved capability map, sent to the client from /api/auth/me so the
 * UI can hide what the user cannot do without guessing at the rules. Every
 * capability is present, so a missing key on the client always means "stale
 * payload", never "allowed".
 */
export function capabilityMap(
  role: StaffRole | null | undefined,
  canTeach: boolean = true,
): CapabilityMap {
  const map = {} as CapabilityMap;
  for (const capability of ALL_CAPABILITIES) {
    map[capability] = can(role, capability, canTeach);
  }
  return map;
}
