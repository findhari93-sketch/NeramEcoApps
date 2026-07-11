'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { isPathEnabled } from '@/lib/feature-flags';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import ViewTimelineOutlinedIcon from '@mui/icons-material/ViewTimelineOutlined';

export type StudentZoneId = 'classroom' | 'study';

const QB_PATH = '/student/question-bank';
const STUDY_MATERIALS_PATH = '/student/study-materials';
const STARRED_PATH = '/student/study-materials/starred';
const SELF_LEARNING_PATH = '/student/self-learning';
const COURSE_PLAN_PATH = '/student/course-plan';
// Covers both the list (/student/class-recaps) and the player (/student/class-recap/[id]).
const CLASS_RECAP_PATH = '/student/class-recap';
const CLASS_RECAPS_PATH = '/student/class-recaps';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}
interface ZoneConfig {
  id: StudentZoneId;
  label: string;
  title: string;
  icon: React.ReactNode;
  defaultPath: string;
  navGroups: NavGroup[];
  bottomNavItems: NavItem[];
  overflowItems: NavItem[];
}

// ── Classroom zone: the full student experience (unchanged from before) ──
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
      ],
    },
    {
      label: 'Learn',
      items: [
        { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
        { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
        { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
        { label: 'Leaderboard', path: '/student/leaderboard', icon: <LeaderboardOutlinedIcon /> },
      ],
    },
    {
      label: 'Practice',
      items: [
        { label: 'Tests', path: '/student/tests', icon: <AssignmentOutlinedIcon /> },
        { label: 'Drawings', path: '/student/drawings', icon: <BrushOutlinedIcon /> },
        { label: 'Recall', path: '/student/exam-recall', icon: <HistoryEduOutlinedIcon /> },
      ],
    },
    {
      label: 'Manage',
      items: [
        { label: 'Documents', path: '/student/documents', icon: <DescriptionOutlinedIcon /> },
        { label: 'Reviews', path: '/student/reviews', icon: <RateReviewOutlinedIcon /> },
        { label: 'Exams', path: '/student/exams', icon: <EventNoteOutlinedIcon /> },
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
  overflowItems: [
    { label: 'Course Plan', path: COURSE_PLAN_PATH, icon: <ViewTimelineOutlinedIcon /> },
    { label: 'Leaderboard', path: '/student/leaderboard', icon: <LeaderboardOutlinedIcon /> },
    { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
    { label: 'Tests', path: '/student/tests', icon: <AssignmentOutlinedIcon /> },
    { label: 'Drawings', path: '/student/drawings', icon: <BrushOutlinedIcon /> },
    { label: 'Recall', path: '/student/exam-recall', icon: <HistoryEduOutlinedIcon /> },
    { label: 'Documents', path: '/student/documents', icon: <DescriptionOutlinedIcon /> },
    { label: 'Reviews', path: '/student/reviews', icon: <RateReviewOutlinedIcon /> },
    { label: 'Exams', path: '/student/exams', icon: <EventNoteOutlinedIcon /> },
    { label: 'My Issues', path: '/student/issues', icon: <BugReportOutlinedIcon /> },
    { label: 'Guide', path: '/student/guide', icon: <HelpOutlineIcon /> },
    { label: 'Profile', path: '/student/profile', icon: <PersonOutlinedIcon /> },
  ],
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
        { label: 'Class Recaps', path: CLASS_RECAPS_PATH, icon: <VideoLibraryOutlinedIcon /> },
        { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
      ],
    },
    {
      label: 'Learn',
      items: [
        { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
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
  overflowItems: [
    { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
    { label: 'Leaderboard', path: '/student/leaderboard', icon: <LeaderboardOutlinedIcon /> },
    { label: 'Guide', path: '/student/guide', icon: <HelpOutlineIcon /> },
    { label: 'Profile', path: '/student/profile', icon: <PersonOutlinedIcon /> },
  ],
};

const ZONES: ZoneConfig[] = [CLASSROOM, STUDY];

const STORAGE_KEY = 'nexus_student_zone';

/**
 * Only routes that are EXCLUSIVE to a zone force an auto-switch. Shared routes (library,
 * qb, checklist live in both) return null so the active zone is preserved.
 */
function detectZoneFromPath(pathname: string): StudentZoneId | null {
  if (
    pathname.startsWith(STUDY_MATERIALS_PATH) ||
    pathname.startsWith(SELF_LEARNING_PATH) ||
    pathname.startsWith(CLASS_RECAP_PATH)
  )
    return 'study';
  const classroomExclusive = [
    '/student/dashboard',
    '/student/timetable',
    COURSE_PLAN_PATH,
    '/student/tests',
    '/student/drawings',
    '/student/exam-recall',
    '/student/documents',
    '/student/reviews',
    '/student/exams',
    '/student/issues',
  ];
  if (classroomExclusive.some((p) => pathname.startsWith(p))) return 'classroom';
  return null;
}

interface StudentZoneContextValue {
  activeZone: StudentZoneId;
  setActiveZone: (zone: StudentZoneId) => void;
  availableZones: { id: StudentZoneId; label: string; icon: React.ReactNode }[];
  currentNavGroups: NavGroup[];
  currentBottomNavItems: NavItem[];
  currentOverflowItems: NavItem[];
  currentHomePath: string;
  currentZoneTitle: string;
}

const StudentZoneContext = createContext<StudentZoneContextValue>({
  activeZone: 'classroom',
  setActiveZone: () => {},
  availableZones: [],
  currentNavGroups: [],
  currentBottomNavItems: [],
  currentOverflowItems: [],
  currentHomePath: '/student/dashboard',
  currentZoneTitle: 'Classroom',
});

export function useStudentZoneContext() {
  return useContext(StudentZoneContext);
}

export default function StudentZoneProvider({
  children,
  isQBEnabled = true,
}: {
  children: React.ReactNode;
  isQBEnabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { featureFlags } = useNexusAuthContext();
  const [activeZone, setActiveZoneState] = useState<StudentZoneId>('classroom');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as StudentZoneId | null;
    if (saved && ZONES.some((z) => z.id === saved)) {
      setActiveZoneState(saved);
    }
    setHydrated(true);
  }, []);

  // Auto-sync zone from the URL (zone-exclusive routes only).
  useEffect(() => {
    if (!hydrated) return;
    const detected = detectZoneFromPath(pathname);
    if (detected && detected !== activeZone) {
      setActiveZoneState(detected);
      localStorage.setItem(STORAGE_KEY, detected);
    }
  }, [pathname, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveZone = useCallback(
    (zone: StudentZoneId) => {
      const config = ZONES.find((z) => z.id === zone);
      if (!config) return;
      setActiveZoneState(zone);
      localStorage.setItem(STORAGE_KEY, zone);
      router.push(config.defaultPath);
    },
    [router],
  );

  const current = ZONES.find((z) => z.id === activeZone) || CLASSROOM;

  // Filter nav by the admin feature flags. Disabled features are stripped from
  // the sidebar/bottom-nav; empty groups and empty zones disappear. Question
  // Bank carries an extra per-classroom gate (isQBEnabled) on top of its global
  // flag, so it shows only when BOTH are on.
  const value = useMemo<StudentZoneContextValue>(() => {
    const isItemEnabled = (path: string) => {
      if (path === QB_PATH && !isQBEnabled) return false;
      return isPathEnabled(path, featureFlags);
    };
    const filterGroups = (groups: NavGroup[]) =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => isItemEnabled(i.path)) }))
        .filter((g) => g.items.length > 0);
    const filterItems = (items: NavItem[]) => items.filter((i) => isItemEnabled(i.path));

    const zoneHasContent = (z: ZoneConfig) =>
      filterItems(z.bottomNavItems).length > 0 ||
      filterItems(z.overflowItems).length > 0 ||
      filterGroups(z.navGroups).length > 0;

    return {
      activeZone,
      setActiveZone,
      availableZones: ZONES.filter(zoneHasContent).map((z) => ({
        id: z.id,
        label: z.label,
        icon: z.icon,
      })),
      currentNavGroups: filterGroups(current.navGroups),
      currentBottomNavItems: filterItems(current.bottomNavItems),
      currentOverflowItems: filterItems(current.overflowItems),
      currentHomePath: current.defaultPath,
      currentZoneTitle: current.title,
    };
  }, [activeZone, setActiveZone, current, isQBEnabled, featureFlags]);

  return <StudentZoneContext.Provider value={value}>{children}</StudentZoneContext.Provider>;
}
