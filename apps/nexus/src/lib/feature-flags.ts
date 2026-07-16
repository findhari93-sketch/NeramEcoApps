/**
 * Nexus feature flags: the single source of truth for which menu items /
 * features are available, and to whom.
 *
 * Motivation: features are rolled out one by one. The admin turns almost every
 * student feature OFF, then switches each one back ON as it is finished and
 * tested. Staff (teacher/admin) menus default ON so the people testing keep
 * their tools. A small "core" set can never be turned off, which guarantees the
 * admin always reaches the control panel (no lockout).
 *
 * This module is PURE TypeScript (no JSX, no next/navigation) so it can be
 * imported from both the server (/api/auth/me) and the client (nav providers,
 * FeatureGate, the admin toggle page).
 *
 * Storage: a single `nexus_settings` row, key `feature_flags`, whose JSONB value
 * is a partial map of `{ [featureId]: boolean }` overrides. Missing keys fall
 * back to each feature's `defaultEnabled`; `core` features are always enabled.
 */

export type FeatureSurface = 'student' | 'staff';

export interface FeatureDef {
  /** Stable id, e.g. 'student.timetable'. Persisted in the settings JSONB. */
  id: string;
  /** Human label shown in the admin toggle UI and the "unavailable" screen. */
  label: string;
  /** Which audience this feature belongs to. */
  surface: FeatureSurface;
  /** Sub-group for the admin UI, e.g. 'Live Class', 'Management'. */
  group: string;
  /**
   * Route/nav prefixes this flag controls. A page is gated by the feature whose
   * path is the longest prefix of the current pathname. Nav items are matched by
   * their exact `path`.
   */
  paths: string[];
  /** Default when there is no admin override. Student items OFF, staff items ON. */
  defaultEnabled: boolean;
  /** Core features are always enabled and never rendered with a switch. */
  core?: boolean;
}

/** The settings key under which overrides live in `nexus_settings`. */
export const FEATURE_FLAGS_KEY = 'feature_flags';

export const FEATURES: FeatureDef[] = [
  // ── Student ──────────────────────────────────────────────────────────────
  { id: 'student.dashboard', label: 'Dashboard', surface: 'student', group: 'Home', paths: ['/student/dashboard'], defaultEnabled: true, core: true },
  { id: 'student.profile', label: 'Profile', surface: 'student', group: 'Home', paths: ['/student/profile'], defaultEnabled: true, core: true },
  { id: 'student.guide', label: 'Guide', surface: 'student', group: 'Home', paths: ['/student/guide'], defaultEnabled: true, core: true },

  { id: 'student.timetable', label: 'Timetable', surface: 'student', group: 'Live Class', paths: ['/student/timetable'], defaultEnabled: false },
  { id: 'student.course-plan', label: 'Course Plan', surface: 'student', group: 'Live Class', paths: ['/student/course-plan'], defaultEnabled: false },
  { id: 'student.assignments', label: 'Assignments', surface: 'student', group: 'Live Class', paths: ['/student/assignments'], defaultEnabled: false },

  { id: 'student.library', label: 'Library', surface: 'student', group: 'Learn', paths: ['/student/library'], defaultEnabled: false },
  { id: 'student.question-bank', label: 'Question Bank', surface: 'student', group: 'Learn', paths: ['/student/question-bank'], defaultEnabled: false },
  { id: 'student.checklist', label: 'Checklist', surface: 'student', group: 'Learn', paths: ['/student/checklist'], defaultEnabled: false },
  { id: 'student.leaderboard', label: 'Leaderboard', surface: 'student', group: 'Learn', paths: ['/student/leaderboard'], defaultEnabled: false },

  { id: 'student.tests', label: 'Tests', surface: 'student', group: 'Practice', paths: ['/student/tests'], defaultEnabled: false },
  { id: 'student.drawings', label: 'Drawings', surface: 'student', group: 'Practice', paths: ['/student/drawings'], defaultEnabled: false },
  { id: 'student.exam-recall', label: 'Recall', surface: 'student', group: 'Practice', paths: ['/student/exam-recall'], defaultEnabled: false },

  { id: 'student.documents', label: 'Documents', surface: 'student', group: 'Manage', paths: ['/student/documents'], defaultEnabled: false },
  { id: 'student.reviews', label: 'Reviews', surface: 'student', group: 'Manage', paths: ['/student/reviews'], defaultEnabled: false },
  { id: 'student.exams', label: 'Exams', surface: 'student', group: 'Manage', paths: ['/student/exams'], defaultEnabled: false },
  { id: 'student.issues', label: 'My Issues', surface: 'student', group: 'Manage', paths: ['/student/issues'], defaultEnabled: false },

  { id: 'student.study-materials', label: 'Study Materials', surface: 'student', group: 'Study Zone', paths: ['/student/study-materials'], defaultEnabled: false },
  { id: 'student.study-materials-starred', label: 'Starred', surface: 'student', group: 'Study Zone', paths: ['/student/study-materials/starred'], defaultEnabled: false },
  { id: 'student.self-learning', label: 'Self-learning', surface: 'student', group: 'Study Zone', paths: ['/student/self-learning'], defaultEnabled: false },
  { id: 'student.class-recaps', label: 'Class Recaps', surface: 'student', group: 'Study Zone', paths: ['/student/class-recaps', '/student/class-recap'], defaultEnabled: false },

  // ── Staff: Teaching panel ─────────────────────────────────────────────────
  { id: 'staff.dashboard', label: 'Dashboard', surface: 'staff', group: 'Teaching', paths: ['/teacher/dashboard'], defaultEnabled: true, core: true },
  { id: 'staff.timetable', label: 'Timetable', surface: 'staff', group: 'Teaching', paths: ['/teacher/timetable'], defaultEnabled: true },
  { id: 'staff.curriculum', label: 'Repository', surface: 'staff', group: 'Teaching', paths: ['/teacher/curriculum'], defaultEnabled: true },
  { id: 'staff.course-plans', label: 'Course Plans', surface: 'staff', group: 'Teaching', paths: ['/teacher/course-plans'], defaultEnabled: true },
  { id: 'staff.assignments', label: 'Assignments', surface: 'staff', group: 'Teaching', paths: ['/teacher/assignments'], defaultEnabled: true },
  { id: 'staff.drawing-reviews', label: 'Drawing Reviews', surface: 'staff', group: 'Teaching', paths: ['/teacher/drawing-reviews'], defaultEnabled: true },
  { id: 'staff.attendance', label: 'Attendance', surface: 'staff', group: 'Teaching', paths: ['/teacher/attendance'], defaultEnabled: true },
  { id: 'staff.leaderboard', label: 'Leaderboard', surface: 'staff', group: 'Teaching', paths: ['/teacher/leaderboard'], defaultEnabled: true },
  { id: 'staff.exams', label: 'Exams', surface: 'staff', group: 'Teaching', paths: ['/teacher/exams'], defaultEnabled: true },
  { id: 'staff.guide', label: 'Teaching Guide', surface: 'staff', group: 'Teaching', paths: ['/teacher/guide'], defaultEnabled: true },

  // ── Staff: Management panel ───────────────────────────────────────────────
  { id: 'staff.classrooms', label: 'Classrooms', surface: 'staff', group: 'Management', paths: ['/teacher/classrooms'], defaultEnabled: true },
  { id: 'staff.students', label: 'Students', surface: 'staff', group: 'Management', paths: ['/teacher/students'], defaultEnabled: true },
  { id: 'staff.reviews', label: 'Reviews', surface: 'staff', group: 'Management', paths: ['/teacher/reviews'], defaultEnabled: true },
  { id: 'staff.modules', label: 'Modules', surface: 'staff', group: 'Management', paths: ['/teacher/modules'], defaultEnabled: true },
  { id: 'staff.study-materials', label: 'Study Materials', surface: 'staff', group: 'Management', paths: ['/teacher/study-materials'], defaultEnabled: true },
  { id: 'staff.study-materials-feedback', label: 'Materials Feedback', surface: 'staff', group: 'Management', paths: ['/teacher/study-materials/feedback'], defaultEnabled: true },
  { id: 'staff.class-recaps', label: 'Class Recaps', surface: 'staff', group: 'Management', paths: ['/teacher/class-recaps'], defaultEnabled: true },
  { id: 'staff.checklists', label: 'Checklists', surface: 'staff', group: 'Management', paths: ['/teacher/checklists'], defaultEnabled: true },
  { id: 'staff.documents', label: 'Documents', surface: 'staff', group: 'Management', paths: ['/teacher/documents'], defaultEnabled: true },
  { id: 'staff.question-bank', label: 'Question Bank', surface: 'staff', group: 'Management', paths: ['/teacher/question-bank'], defaultEnabled: true },
  { id: 'staff.exam-recall', label: 'Recall', surface: 'staff', group: 'Management', paths: ['/teacher/exam-recall'], defaultEnabled: true },
  { id: 'staff.tests', label: 'Tests', surface: 'staff', group: 'Management', paths: ['/teacher/tests'], defaultEnabled: true },
  { id: 'staff.questions', label: 'Questions', surface: 'staff', group: 'Management', paths: ['/teacher/questions'], defaultEnabled: true },
  { id: 'staff.library', label: 'Library', surface: 'staff', group: 'Management', paths: ['/teacher/library/review'], defaultEnabled: true },
  { id: 'staff.library-engagement', label: 'Engagement', surface: 'staff', group: 'Management', paths: ['/teacher/library/engagement'], defaultEnabled: true },
  { id: 'staff.devices', label: 'Devices', surface: 'staff', group: 'Management', paths: ['/teacher/devices'], defaultEnabled: true },
  { id: 'staff.issues', label: 'Issues', surface: 'staff', group: 'Management', paths: ['/teacher/issues'], defaultEnabled: true },
  { id: 'staff.management-guide', label: 'Management Guide', surface: 'staff', group: 'Management', paths: ['/teacher/management-guide'], defaultEnabled: true },

  // ── Staff: Admin panel (all core, the control room) ───────────────────────
  { id: 'staff.admin-users', label: 'Users', surface: 'staff', group: 'Admin', paths: ['/teacher/admin/users'], defaultEnabled: true, core: true },
  { id: 'staff.admin-review-platforms', label: 'Review URLs', surface: 'staff', group: 'Admin', paths: ['/teacher/admin/review-platforms'], defaultEnabled: true, core: true },
  { id: 'staff.admin-settings', label: 'Settings', surface: 'staff', group: 'Admin', paths: ['/teacher/admin/settings'], defaultEnabled: true, core: true },
  { id: 'staff.admin-features', label: 'Features', surface: 'staff', group: 'Admin', paths: ['/teacher/admin/features'], defaultEnabled: true, core: true },
];

/** Fast id → def lookup. */
const FEATURE_BY_ID: Record<string, FeatureDef> = FEATURES.reduce((acc, f) => {
  acc[f.id] = f;
  return acc;
}, {} as Record<string, FeatureDef>);

export type FlagMap = Record<string, boolean>;

/**
 * Merge admin overrides with registry defaults into a full, resolved flag map
 * (every known feature id → boolean). Core features are forced on.
 */
export function resolveFlags(overrides: FlagMap = {}): FlagMap {
  const out: FlagMap = {};
  for (const f of FEATURES) {
    out[f.id] = f.core
      ? true
      : typeof overrides[f.id] === 'boolean'
        ? overrides[f.id]
        : f.defaultEnabled;
  }
  return out;
}

/** A map with every feature enabled. Used as the E2E test-mode fallback. */
export function allFeaturesEnabled(): FlagMap {
  const out: FlagMap = {};
  for (const f of FEATURES) out[f.id] = true;
  return out;
}

/** Is a specific feature id enabled in a resolved map? Unknown ids are allowed. */
export function isFeatureEnabled(id: string, flags: FlagMap): boolean {
  const f = FEATURE_BY_ID[id];
  if (!f) return true;
  return flags[id] !== false;
}

/**
 * Find the feature that owns a pathname, by longest matching path prefix.
 * Returns undefined for ungated routes (which are always allowed).
 */
export function featureForPath(pathname: string): FeatureDef | undefined {
  let best: FeatureDef | undefined;
  let bestLen = -1;
  for (const f of FEATURES) {
    for (const p of f.paths) {
      if ((pathname === p || pathname.startsWith(p + '/')) && p.length > bestLen) {
        best = f;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * Is the feature that owns this path enabled? Ungated paths are always allowed.
 * Use this for both nav-item filtering (exact item path) and page gating.
 */
export function isPathEnabled(pathname: string, flags: FlagMap): boolean {
  const f = featureForPath(pathname);
  if (!f) return true;
  return flags[f.id] !== false;
}
