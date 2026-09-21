/**
 * Every navigation item in Nexus, and the rules that turn one list into the
 * three surfaces that render it.
 *
 * WHY THIS FILE EXISTS
 *
 * Navigation used to be three hand-written arrays per panel: `sidebarItems`,
 * `bottomNavItems` and `overflowItems`. The desktop sidebar is hidden below
 * 900px and the bottom bar renders only the last two, so anything that landed in
 * `sidebarItems` alone was unreachable on a phone or an iPad in portrait. Nine
 * items had drifted that way, Catch-up among them, because nothing connected
 * "I added a sidebar item" to "I updated two other arrays".
 *
 * So there is now ONE array per panel. The bottom bar is a short list of paths
 * promoted out of it, and the "More" sheet is everything left over, computed.
 * Adding a nav item makes it reachable everywhere by construction.
 *
 * It is a plain data module on purpose: the providers that consume it pull in
 * MSAL through useNexusAuth, and the guard test that proves the invariant should
 * not have to boot an auth stack to read a list of links.
 */
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ViewModuleOutlinedIcon from '@mui/icons-material/ViewModuleOutlined';
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import HistoryToggleOffOutlinedIcon from '@mui/icons-material/HistoryToggleOffOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FaceRetouchingNaturalOutlinedIcon from '@mui/icons-material/FaceRetouchingNaturalOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ArchitectureOutlinedIcon from '@mui/icons-material/ArchitectureOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { QB_EXAM_LABELS, QB_EXAM_ORDER, qbExamPath, qbHomePath, type QBSurface } from '@/lib/qb-exam-routes';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import ViewTimelineOutlinedIcon from '@mui/icons-material/ViewTimelineOutlined';
import type { Capability } from '@/lib/staff-capabilities';

export interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  /**
   * Capability required to see this item. Composes with the feature flag: a flag
   * answers "is this feature switched on yet", a capability answers "may this
   * person use it". Omit for items every staff tier may see.
   *
   * Panel-level `requiredRoles` is too coarse for this. Cohort management sits in
   * the same panel as the teaching tools an external teacher genuinely needs.
   */
  capability?: Capability;
  /**
   * Heading this item sits under in the mobile "More" sheet. The staff sidebar
   * still renders flat, so this is a mobile-only affordance: a sheet holding
   * fourteen links needs sections or nobody finds the fifteenth.
   */
  group?: string;
  /**
   * Makes this item a folder. The sidebar renders the children indented under
   * it; the bottom bar and the More sheet, which have no room for nesting, list
   * the children in its place (see `flattenNavItems`). The parent keeps its own
   * `path` for the icons-only sidebar and for a bottom-bar tab.
   */
  children?: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// ── Question Bank ───────────────────────────────────────────────────────────

/** Heading the exam links sit under in the More sheet. */
export const QB_NAV_GROUP = 'Question Bank';

const QB_EXAM_ICONS = {
  JEE_PAPER_2: <LibraryBooksOutlinedIcon />,
  NATA: <ArchitectureOutlinedIcon />,
} as const;

/**
 * "Question Bank" as a folder with one link per exam. The parent path is a
 * redirect to the exam used last, which is what a bottom-bar tab or an
 * icons-only sidebar button needs from a folder it cannot open.
 */
function questionBankFolder(surface: QBSurface, label: string, group?: string): NavItem {
  return {
    label,
    path: qbHomePath(surface),
    icon: <LibraryBooksOutlinedIcon />,
    group,
    children: QB_EXAM_ORDER.map((exam) => ({
      label: QB_EXAM_LABELS[exam],
      path: qbExamPath(surface, exam),
      icon: QB_EXAM_ICONS[exam],
      group: QB_NAV_GROUP,
    })),
  };
}

// ── Panels (teacher / admin) ────────────────────────────────────────────────

export type PanelId = 'teaching' | 'management' | 'admin';

/** Root of the Course Plans section (its sidebar item + sub-nav are special-cased). */
export const COURSE_PLANS_PATH = '/teacher/course-plans';

/**
 * The Course Plans left-rail sub-navigation. "Overview" is the plans list;
 * the rest are the screens of the currently open plan (a `[planId]` route).
 * `suffix` is appended to `/teacher/course-plans/{planId}`.
 */
export const COURSE_PLAN_SUBNAV: {
  key: string;
  label: string;
  planScreen: boolean;
  suffix: string;
}[] = [
  { key: 'overview', label: 'Overview', planScreen: false, suffix: '' },
  { key: 'builder', label: 'Builder', planScreen: true, suffix: '' },
  { key: 'schedule', label: 'Schedule', planScreen: true, suffix: '/schedule' },
  { key: 'classday', label: 'Class Day', planScreen: true, suffix: '/class-day' },
  { key: 'health', label: 'Health', planScreen: true, suffix: '/health' },
  // "Topic plan", not "Catch-up": this is the plan-scoped TOPIC track a teacher
  // curates and shares. The class-by-class catch-up journey now owns the
  // "Catch-up" name in Management, and two things under one label is how a
  // teacher ends up on the wrong screen.
  { key: 'catchup', label: 'Topic plan', planScreen: true, suffix: '/catchup' },
];

export interface PanelConfig {
  id: PanelId;
  label: string;
  title: string;
  icon: React.ReactNode;
  requiredRoles: string[];
  /** The one list. Everything a panel can reach, in sidebar order. */
  sidebarItems: NavItem[];
  /**
   * Paths promoted to the bottom bar, in bar order. Keep it to four: the fifth
   * slot belongs to "More", and five labels do not fit at 375px.
   *
   * Every path here MUST also appear in `sidebarItems`. `nav-config.test.ts`
   * fails the build if one does not, because a promoted path with no matching
   * item would silently vanish from both surfaces.
   */
  bottomNavPaths: string[];
  defaultPath: string;
}

export const PANELS: PanelConfig[] = [
  {
    id: 'teaching',
    label: 'Teaching',
    title: 'Classroom Teaching',
    icon: <SchoolOutlinedIcon sx={{ fontSize: '1.15rem' }} />,
    requiredRoles: ['teacher', 'admin'],
    defaultPath: '/teacher/dashboard',
    sidebarItems: [
      { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardOutlinedIcon />, group: 'Today' },
      // One class, from the schedule to the record to what is still owed.
      // Attendance is MARKED inside Timetable (ClassAttendancePanel), read across
      // classes on /teacher/attendance, and chased in Catch-up. Catch-up used to
      // sit in the Management panel, so following up on attendance swapped the
      // whole sidebar out from under the teacher mid-task.
      { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon />, group: 'Classes' },
      { label: 'Attendance', path: '/teacher/attendance', icon: <EventNoteOutlinedIcon />, group: 'Classes' },
      // Class Recaps used to be its own Management item. It was half of this one:
      // a list of recorded classes with a Create recap button, next to a screen
      // that knew which of those missing recaps were blocking real students.
      // Both live here now, in the Classes and recaps tab.
      { label: 'Catch-up', path: '/teacher/catch-up', icon: <HistoryToggleOffOutlinedIcon />, group: 'Classes' },
      { label: 'Repository', path: '/teacher/curriculum', icon: <AutoStoriesOutlinedIcon />, group: 'Curriculum' },
      { label: 'Course Plans', path: COURSE_PLANS_PATH, icon: <PlaylistAddCheckOutlinedIcon />, group: 'Curriculum' },
      { label: 'Assignments', path: '/teacher/assignments', icon: <AssignmentTurnedInOutlinedIcon />, group: 'Student work' },
      // Sketchbooks and Inspiration were two items side by side in this group.
      // They are one destination now, with Inspiration as a tab inside it; see
      // lib/drawings-hub. The path stays /teacher/sketchbook because Teams
      // cards, the evening digest and the sender callback all point at it.
      { label: 'Drawings', path: '/teacher/sketchbook', icon: <BrushOutlinedIcon />, group: 'Student work' },
      { label: 'Leaderboard', path: '/teacher/leaderboard', icon: <LeaderboardOutlinedIcon />, group: 'Records' },
      { label: 'Exams', path: '/teacher/exams', icon: <DateRangeOutlinedIcon />, group: 'Records' },
      { label: 'Guide', path: '/teacher/guide', icon: <HelpOutlineOutlinedIcon />, group: 'Help' },
    ],
    bottomNavPaths: [
      '/teacher/dashboard',
      '/teacher/timetable',
      '/teacher/assignments',
      '/teacher/attendance',
    ],
  },
  {
    id: 'management',
    label: 'Management',
    title: 'Management Panel',
    icon: <AutoStoriesOutlinedIcon sx={{ fontSize: '1.15rem' }} />,
    requiredRoles: ['teacher', 'admin'],
    defaultPath: '/teacher/classrooms',
    sidebarItems: [
      // Cohort structure: create classrooms, batches, enrolments, Teams links.
      // Internal team only; an external teacher has no business in here and the
      // matching API routes already refuse them.
      { label: 'Classrooms', path: '/teacher/classrooms', icon: <SchoolOutlinedIcon />, capability: 'structure.enrollment.add', group: 'People' },
      { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon />, group: 'People' },
      // Was in no sidebar at all: reachable only from the Students page and from
      // the Attendance standing rows. Listed here so it can be found and returned to.
      { label: 'Watchlist', path: '/teacher/students/watchlist', icon: <VisibilityOutlinedIcon />, group: 'People' },
      { label: 'Photo Review', path: '/teacher/photo-review', icon: <FaceRetouchingNaturalOutlinedIcon />, group: 'People' },
      { label: 'Reviews', path: '/teacher/reviews', icon: <CampaignOutlinedIcon />, group: 'Operations' },
      { label: 'Modules', path: '/teacher/modules', icon: <ViewModuleOutlinedIcon />, group: 'Content' },
      { label: 'Study Materials', path: '/teacher/study-materials', icon: <FolderOutlinedIcon />, group: 'Content' },
      { label: 'Materials Feedback', path: '/teacher/study-materials/feedback', icon: <RateReviewOutlinedIcon />, group: 'Content' },
      { label: 'Checklists', path: '/teacher/checklists', icon: <PlaylistAddCheckOutlinedIcon />, group: 'Content' },
      { label: 'Documents', path: '/teacher/documents', icon: <DescriptionOutlinedIcon />, group: 'Content' },
      questionBankFolder('teacher', 'Question Bank', 'Assessment'),
      { label: 'Tests', path: '/teacher/tests', icon: <FactCheckOutlinedIcon />, group: 'Assessment' },
      { label: 'Recall', path: '/teacher/exam-recall', icon: <HistoryEduOutlinedIcon />, group: 'Assessment' },
      { label: 'Library', path: '/teacher/library/review', icon: <VideoLibraryOutlinedIcon />, group: 'Content' },
      { label: 'Engagement', path: '/teacher/library/engagement', icon: <BarChartOutlinedIcon />, group: 'Progress' },
      { label: 'Devices', path: '/teacher/devices', icon: <DevicesOutlinedIcon />, group: 'Operations' },
      { label: 'Issues', path: '/teacher/issues', icon: <BugReportOutlinedIcon />, group: 'Operations' },
      { label: 'Guide', path: '/teacher/management-guide', icon: <HelpOutlineOutlinedIcon />, group: 'Help' },
    ],
    bottomNavPaths: [
      '/teacher/classrooms',
      '/teacher/students',
      '/teacher/library/review',
      '/teacher/modules',
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    title: 'Admin Panel',
    icon: <SettingsOutlinedIcon sx={{ fontSize: '1.15rem' }} />,
    requiredRoles: ['admin'],
    defaultPath: '/teacher/admin/users',
    sidebarItems: [
      { label: 'Users', path: '/teacher/admin/users', icon: <GroupOutlinedIcon />, group: 'Admin' },
      { label: 'Features', path: '/teacher/admin/features', icon: <ToggleOnOutlinedIcon />, group: 'Admin' },
      { label: 'Review URLs', path: '/teacher/admin/review-platforms', icon: <LinkOutlinedIcon />, group: 'Admin' },
      { label: 'AI usage', path: '/teacher/admin/ai-usage', icon: <InsightsOutlinedIcon />, group: 'Admin' },
      { label: 'Settings', path: '/teacher/admin/settings', icon: <SettingsOutlinedIcon />, group: 'Admin' },
    ],
    // Four, not five. All five used to sit in the bar, which left "Review URLs"
    // and "AI usage" sharing 75px each at 375px. The fifth is one tap away in
    // More now, and it is the one an admin opens least.
    bottomNavPaths: [
      '/teacher/admin/users',
      '/teacher/admin/features',
      '/teacher/admin/ai-usage',
      '/teacher/admin/settings',
    ],
  },
];

// ── Zones (student) ─────────────────────────────────────────────────────────

export type StudentZoneId = 'classroom' | 'study';

export const QB_PATH = '/student/question-bank';
export const STUDY_MATERIALS_PATH = '/student/study-materials';
export const STARRED_PATH = '/student/study-materials/starred';
export const SELF_LEARNING_PATH = '/student/self-learning';
export const COURSE_PLAN_PATH = '/student/course-plan';
export const ASSIGNMENTS_PATH = '/student/assignments';
export const CATCHUP_PATH = '/student/catch-up';
// The gated player, /student/class-recap/[id]. There is deliberately no list
// path beside it any more: the Study Zone used to carry a "Class Recaps" item
// pointing at /student/class-recaps, which showed every recap in the classroom
// whether the student owed it or not. Two doors to the same recording, and only
// the Catch-up one started the clock, so a student watching through the other
// stayed "not started" to their teacher. Catch-up owns both now, as its
// "Watch again" tab, and the plural route redirects there.
export const CLASS_RECAP_PATH = '/student/class-recap';
export const RESOURCES_PATH = '/student/resources';
export const DRAWINGS_PATH = '/student/sketchbook';

export interface ZoneConfig {
  id: StudentZoneId;
  label: string;
  title: string;
  icon: React.ReactNode;
  defaultPath: string;
  /** The one list, already sectioned. Both the sidebar and the More sheet read it. */
  navGroups: NavGroup[];
  /**
   * The bottom bar. Full items rather than paths because "Home" is bar-only: it
   * is the zone's landing page and would be noise as a sidebar row.
   */
  bottomNavItems: NavItem[];
  /**
   * Reachable from the More sheet but deliberately absent from the sidebar.
   * Profile and Guide live in the top-bar avatar menu on desktop, which does not
   * exist on a phone. `group` folds them under an existing heading.
   */
  extraOverflowItems: NavItem[];
  /**
   * The nav path whose badge count stands for "there is work waiting in this
   * zone", shown on the zone pill while the OTHER zone is active.
   *
   * The Study Zone is where a student lands by default and it has no Catch-up
   * item, by design. Without this, a student with five classes owed sees nothing
   * about them until they think to switch zones.
   */
  badgePath?: string;
}

// ── Classroom zone: the full student experience ──
const CLASSROOM: ZoneConfig = {
  id: 'classroom',
  label: 'Classroom',
  title: 'Classroom',
  icon: <SchoolOutlinedIcon sx={{ fontSize: '1.15rem' }} />,
  defaultPath: '/student/dashboard',
  navGroups: [
    {
      label: 'Live Class',
      items: [
        { label: 'Timetable', path: '/student/timetable', icon: <CalendarTodayOutlinedIcon /> },
        { label: 'Course Plan', path: COURSE_PLAN_PATH, icon: <ViewTimelineOutlinedIcon /> },
        { label: 'Assignments', path: ASSIGNMENTS_PATH, icon: <AssignmentTurnedInOutlinedIcon /> },
        // The student half of the staff Classes group: the schedule, the record,
        // then what is still owed. Behind student.attendance.
        { label: 'Attendance', path: '/student/attendance', icon: <EventNoteOutlinedIcon /> },
        { label: 'Catch-up', path: CATCHUP_PATH, icon: <HistoryToggleOffOutlinedIcon /> },
      ],
    },
    {
      label: 'Learn',
      items: [
        { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
        questionBankFolder('student', 'Question Bank'),
        { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
        { label: 'Leaderboard', path: '/student/leaderboard', icon: <LeaderboardOutlinedIcon /> },
      ],
    },
    {
      label: 'Practice',
      items: [
        { label: 'Tests', path: '/student/tests', icon: <AssignmentOutlinedIcon /> },
        { label: 'Drawings', path: DRAWINGS_PATH, icon: <BrushOutlinedIcon /> },
        { label: 'Recall', path: '/student/exam-recall', icon: <HistoryEduOutlinedIcon /> },
      ],
    },
    {
      label: 'Manage',
      items: [
        { label: 'Documents', path: '/student/documents', icon: <DescriptionOutlinedIcon /> },
        { label: 'Reviews', path: '/student/reviews', icon: <RateReviewOutlinedIcon /> },
        { label: 'Exams', path: '/student/exams', icon: <EventNoteOutlinedIcon /> },
        { label: 'Away dates', path: '/student/planned-absence', icon: <EventBusyOutlinedIcon /> },
        { label: 'My Issues', path: '/student/issues', icon: <BugReportOutlinedIcon /> },
      ],
    },
  ],
  bottomNavItems: [
    { label: 'Home', path: '/student/dashboard', icon: <HomeOutlinedIcon /> },
    { label: 'Timetable', path: '/student/timetable', icon: <CalendarTodayOutlinedIcon /> },
    { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
    { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
  ],
  extraOverflowItems: [
    { label: 'Guide', path: '/student/guide', icon: <HelpOutlineOutlinedIcon />, group: 'Account' },
    { label: 'Profile', path: '/student/profile', icon: <PersonOutlinedIcon />, group: 'Account' },
  ],
  badgePath: CATCHUP_PATH,
};

// ── Study Zone: a focused, distraction-free mode for studying ──
const STUDY: ZoneConfig = {
  id: 'study',
  label: 'Study Zone',
  title: 'Study Zone',
  icon: <AutoStoriesOutlinedIcon sx={{ fontSize: '1.15rem' }} />,
  defaultPath: STUDY_MATERIALS_PATH,
  navGroups: [
    {
      label: 'Study',
      items: [
        { label: 'Study Materials', path: STUDY_MATERIALS_PATH, icon: <FolderOutlinedIcon /> },
        { label: 'Starred', path: STARRED_PATH, icon: <StarBorderOutlinedIcon /> },
        { label: 'Self-learning', path: SELF_LEARNING_PATH, icon: <AutoStoriesOutlinedIcon /> },
        { label: 'Reference', path: RESOURCES_PATH, icon: <MenuBookOutlinedIcon /> },
        { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
        { label: 'Drawings', path: DRAWINGS_PATH, icon: <BrushOutlinedIcon /> },
      ],
    },
    {
      label: 'Learn',
      items: [
        questionBankFolder('student', 'Question Bank'),
        { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
      ],
    },
  ],
  bottomNavItems: [
    { label: 'Materials', path: STUDY_MATERIALS_PATH, icon: <FolderOutlinedIcon /> },
    { label: 'Self-learning', path: SELF_LEARNING_PATH, icon: <AutoStoriesOutlinedIcon /> },
    { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
    { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
  ],
  extraOverflowItems: [
    // In the Study Zone's More sheet but not its sidebar, which is how it has
    // always been. Folded into Learn rather than given a heading of its own.
    { label: 'Leaderboard', path: '/student/leaderboard', icon: <LeaderboardOutlinedIcon />, group: 'Learn' },
    { label: 'Guide', path: '/student/guide', icon: <HelpOutlineOutlinedIcon />, group: 'Account' },
    { label: 'Profile', path: '/student/profile', icon: <PersonOutlinedIcon />, group: 'Account' },
  ],
};

// Study Zone is listed first so it reads as the primary/default zone in both the
// top-bar pill and the profile-menu "Switch Zone" list. Classroom is secondary.
// Order is display-only; lookups use .find, so this does not affect routing.
export const ZONES: ZoneConfig[] = [STUDY, CLASSROOM];

// ── Derivation ──────────────────────────────────────────────────────────────

/**
 * Bucket items under their `group`, keeping array order inside each bucket and
 * ordering the buckets by first appearance. Items with no group collect in a
 * trailing unlabelled bucket, which renders without a heading.
 */
export function groupNavItems(items: NavItem[]): NavGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, NavItem[]>();
  for (const item of items) {
    const label = item.group ?? '';
    if (!buckets.has(label)) {
      buckets.set(label, []);
      if (label) order.push(label);
    }
    buckets.get(label)!.push(item);
  }
  const groups = order.map((label) => ({ label, items: buckets.get(label)! }));
  const ungrouped = buckets.get('');
  if (ungrouped?.length) groups.push({ label: '', items: ungrouped });
  return groups;
}

/**
 * A list as a phone sees it: every folder replaced by its children.
 *
 * The bottom bar and the More sheet have no nesting, so a folder's links would
 * otherwise exist only in a sidebar that is hidden below 900px, which is the bug
 * this file was written to end.
 */
export function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => (i.children?.length ? i.children : [i]));
}

/**
 * Filter a list, folders included. A folder whose every child is filtered out
 * goes too, so the sidebar never shows a heading that opens onto nothing.
 */
export function filterNavTree(items: NavItem[], keep: (item: NavItem) => boolean): NavItem[] {
  return items.flatMap((item) => {
    if (!keep(item)) return [];
    if (!item.children) return [item];
    const children = item.children.filter(keep);
    return children.length > 0 ? [{ ...item, children }] : [];
  });
}

/** The bottom bar for a panel, resolved from `bottomNavPaths` in bar order. */
export function panelBottomNav(panel: PanelConfig): NavItem[] {
  const reachable = [...panel.sidebarItems, ...flattenNavItems(panel.sidebarItems)];
  return panel.bottomNavPaths
    .map((path) => reachable.find((i) => i.path === path))
    .filter((i): i is NavItem => !!i);
}

/** Everything the bottom bar did not take. This is the whole point of the file. */
export function panelOverflow(panel: PanelConfig): NavItem[] {
  const promoted = new Set(panel.bottomNavPaths);
  return flattenNavItems(panel.sidebarItems).filter((i) => !promoted.has(i.path));
}

/** Every item a zone can reach from its sidebar, flattened, each tagged with its heading. */
export function zoneSidebarItems(zone: ZoneConfig): NavItem[] {
  return zone.navGroups.flatMap((g) =>
    flattenNavItems(g.items).map((i) => ({ ...i, group: i.group ?? g.label })),
  );
}

/** Everything the zone's bottom bar did not take, plus its overflow-only extras. */
export function zoneOverflow(zone: ZoneConfig): NavItem[] {
  const promoted = new Set(zone.bottomNavItems.map((i) => i.path));
  return [
    ...zoneSidebarItems(zone).filter((i) => !promoted.has(i.path)),
    ...zone.extraOverflowItems,
  ];
}
