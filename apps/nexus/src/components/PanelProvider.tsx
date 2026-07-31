'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
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
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FaceRetouchingNaturalOutlinedIcon from '@mui/icons-material/FaceRetouchingNaturalOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { isPathEnabled } from '@/lib/feature-flags';
import type { Capability } from '@/lib/staff-capabilities';

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

interface NavItem {
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
}

interface PanelConfig {
  id: PanelId;
  label: string;
  title: string;
  icon: React.ReactNode;
  requiredRoles: string[];
  sidebarItems: NavItem[];
  bottomNavItems: NavItem[];
  overflowItems: NavItem[];
  defaultPath: string;
}

const PANELS: PanelConfig[] = [
  {
    id: 'teaching',
    label: 'Teaching',
    title: 'Classroom Teaching',
    icon: <SchoolOutlinedIcon sx={{ fontSize: '1.15rem' }} />,
    requiredRoles: ['teacher', 'admin'],
    defaultPath: '/teacher/dashboard',
    sidebarItems: [
      { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardOutlinedIcon /> },
      { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon /> },
      { label: 'Repository', path: '/teacher/curriculum', icon: <AutoStoriesOutlinedIcon /> },
      { label: 'Course Plans', path: '/teacher/course-plans', icon: <PlaylistAddCheckOutlinedIcon /> },
      { label: 'Assignments', path: '/teacher/assignments', icon: <AssignmentTurnedInOutlinedIcon /> },
      { label: 'Drawing Reviews', path: '/teacher/drawing-reviews', icon: <BrushOutlinedIcon /> },
      { label: 'Attendance', path: '/teacher/attendance', icon: <EventNoteOutlinedIcon /> },
      { label: 'Leaderboard', path: '/teacher/leaderboard', icon: <LeaderboardOutlinedIcon /> },
      { label: 'Exams', path: '/teacher/exams', icon: <DateRangeOutlinedIcon /> },
      { label: 'Guide', path: '/teacher/guide', icon: <HelpOutlineOutlinedIcon /> },
    ],
    bottomNavItems: [
      { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardOutlinedIcon /> },
      { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon /> },
      { label: 'Drawings', path: '/teacher/drawing-reviews', icon: <BrushOutlinedIcon /> },
      { label: 'Attendance', path: '/teacher/attendance', icon: <EventNoteOutlinedIcon /> },
    ],
    overflowItems: [
      { label: 'Assignments', path: '/teacher/assignments', icon: <AssignmentTurnedInOutlinedIcon /> },
      { label: 'Leaderboard', path: '/teacher/leaderboard', icon: <LeaderboardOutlinedIcon /> },
      { label: 'Exams', path: '/teacher/exams', icon: <DateRangeOutlinedIcon /> },
      { label: 'Guide', path: '/teacher/guide', icon: <HelpOutlineOutlinedIcon /> },
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
      { label: 'Classrooms', path: '/teacher/classrooms', icon: <SchoolOutlinedIcon />, capability: 'structure.enrollment.add' },
      { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
      { label: 'Photo Review', path: '/teacher/photo-review', icon: <FaceRetouchingNaturalOutlinedIcon /> },
      { label: 'Reviews', path: '/teacher/reviews', icon: <CampaignOutlinedIcon /> },
      { label: 'Modules', path: '/teacher/modules', icon: <ViewModuleOutlinedIcon /> },
      { label: 'Study Materials', path: '/teacher/study-materials', icon: <FolderOutlinedIcon /> },
      { label: 'Materials Feedback', path: '/teacher/study-materials/feedback', icon: <RateReviewOutlinedIcon /> },
      // Class Recaps used to sit here as its own item. It was half of this one:
      // a list of recorded classes with a Create recap button, next to a screen
      // that knew which of those missing recaps were blocking real students.
      // Both live under Catch-up now, in the Classes and recaps tab.
      { label: 'Catch-up', path: '/teacher/catch-up', icon: <HistoryToggleOffOutlinedIcon /> },
      { label: 'Checklists', path: '/teacher/checklists', icon: <PlaylistAddCheckOutlinedIcon /> },
      { label: 'Documents', path: '/teacher/documents', icon: <DescriptionOutlinedIcon /> },
      { label: 'Question Bank', path: '/teacher/question-bank', icon: <LibraryBooksOutlinedIcon /> },
      { label: 'Tests', path: '/teacher/tests', icon: <FactCheckOutlinedIcon /> },
      { label: 'Recall', path: '/teacher/exam-recall', icon: <HistoryEduOutlinedIcon /> },
      { label: 'Library', path: '/teacher/library/review', icon: <VideoLibraryOutlinedIcon /> },
      { label: 'Engagement', path: '/teacher/library/engagement', icon: <BarChartOutlinedIcon /> },
      { label: 'Devices', path: '/teacher/devices', icon: <DevicesOutlinedIcon /> },
      { label: 'Issues', path: '/teacher/issues', icon: <BugReportOutlinedIcon /> },
      { label: 'Guide', path: '/teacher/management-guide', icon: <HelpOutlineOutlinedIcon /> },
    ],
    bottomNavItems: [
      // Cohort structure: create classrooms, batches, enrolments, Teams links.
      // Internal team only; an external teacher has no business in here and the
      // matching API routes already refuse them.
      { label: 'Classrooms', path: '/teacher/classrooms', icon: <SchoolOutlinedIcon />, capability: 'structure.enrollment.add' },
      { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
      { label: 'Library', path: '/teacher/library/review', icon: <VideoLibraryOutlinedIcon /> },
      { label: 'Modules', path: '/teacher/modules', icon: <ViewModuleOutlinedIcon /> },
    ],
    overflowItems: [
      { label: 'Photo Review', path: '/teacher/photo-review', icon: <FaceRetouchingNaturalOutlinedIcon /> },
      { label: 'Reviews', path: '/teacher/reviews', icon: <CampaignOutlinedIcon /> },
      { label: 'Checklists', path: '/teacher/checklists', icon: <PlaylistAddCheckOutlinedIcon /> },
      { label: 'Engagement', path: '/teacher/library/engagement', icon: <BarChartOutlinedIcon /> },
      { label: 'Documents', path: '/teacher/documents', icon: <DescriptionOutlinedIcon /> },
      { label: 'Question Bank', path: '/teacher/question-bank', icon: <LibraryBooksOutlinedIcon /> },
      { label: 'Tests', path: '/teacher/tests', icon: <FactCheckOutlinedIcon /> },
      { label: 'Recall', path: '/teacher/exam-recall', icon: <HistoryEduOutlinedIcon /> },
      { label: 'Issues', path: '/teacher/issues', icon: <BugReportOutlinedIcon /> },
      { label: 'Guide', path: '/teacher/management-guide', icon: <HelpOutlineOutlinedIcon /> },
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
      { label: 'Users', path: '/teacher/admin/users', icon: <GroupOutlinedIcon /> },
      { label: 'Features', path: '/teacher/admin/features', icon: <ToggleOnOutlinedIcon /> },
      { label: 'Review URLs', path: '/teacher/admin/review-platforms', icon: <LinkOutlinedIcon /> },
      { label: 'Settings', path: '/teacher/admin/settings', icon: <SettingsOutlinedIcon /> },
    ],
    bottomNavItems: [
      { label: 'Users', path: '/teacher/admin/users', icon: <GroupOutlinedIcon /> },
      { label: 'Features', path: '/teacher/admin/features', icon: <ToggleOnOutlinedIcon /> },
      { label: 'Review URLs', path: '/teacher/admin/review-platforms', icon: <LinkOutlinedIcon /> },
      { label: 'Settings', path: '/teacher/admin/settings', icon: <SettingsOutlinedIcon /> },
    ],
    overflowItems: [],
  },
];

// Map paths to panels for URL-based auto-sync
const PATH_TO_PANEL: Record<string, PanelId> = {};
for (const panel of PANELS) {
  for (const item of panel.sidebarItems) {
    PATH_TO_PANEL[item.path] = panel.id;
  }
}

function detectPanelFromPath(pathname: string): PanelId | null {
  // Check exact match first
  if (PATH_TO_PANEL[pathname]) return PATH_TO_PANEL[pathname];

  // Check prefix match (e.g., /teacher/classrooms/123 → management)
  if (pathname.startsWith('/teacher/drawing-reviews')) return 'teaching';
  if (pathname.startsWith('/teacher/curriculum')) return 'teaching';
  if (pathname.startsWith('/teacher/course-plans')) return 'teaching';
  if (pathname.startsWith('/teacher/exam-schedule')) return 'teaching';
  if (pathname.startsWith('/teacher/exams')) return 'teaching';
  if (pathname.startsWith('/teacher/admin/')) return 'admin';
  // Student sub-pages: city-wise drill-down, inactivity watchlist, detail
  if (pathname.startsWith('/teacher/students')) return 'management';
  if (pathname.startsWith('/teacher/photo-review')) return 'management';
  // Review campaign pages
  if (pathname.startsWith('/teacher/reviews')) return 'management';
  // Foundation pages are still accessible via Module Library (management panel)
  if (pathname.startsWith('/teacher/foundation')) return 'management';
  // Library pages (review, engagement, collections)
  if (pathname.startsWith('/teacher/library')) return 'management';
  // Exam recall moderation pages
  if (pathname.startsWith('/teacher/exam-recall')) return 'management';

  for (const [path, panelId] of Object.entries(PATH_TO_PANEL)) {
    if (pathname.startsWith(path + '/')) return panelId;
  }

  return null;
}

const STORAGE_KEY = 'nexus_active_panel';

interface PanelContextValue {
  activePanel: PanelId;
  setActivePanel: (panelId: PanelId) => void;
  availablePanels: PanelConfig[];
  currentPanelTitle: string;
  currentSidebarItems: NavItem[];
  currentBottomNavItems: NavItem[];
  currentOverflowItems: NavItem[];
}

const PanelContext = createContext<PanelContextValue>({
  activePanel: 'teaching',
  setActivePanel: () => {},
  availablePanels: [],
  currentPanelTitle: 'Classroom Teaching',
  currentSidebarItems: [],
  currentBottomNavItems: [],
  currentOverflowItems: [],
});

export function usePanelContext() {
  return useContext(PanelContext);
}

export default function PanelProvider({ children }: { children: React.ReactNode }) {
  const { nexusRole, featureFlags, can } = useNexusAuthContext();
  const pathname = usePathname();
  const router = useRouter();
  const [activePanel, setActivePanelState] = useState<PanelId>('teaching');
  const [hydrated, setHydrated] = useState(false);

  // Filter panels by role AND by feature flags: a panel whose every nav item is
  // disabled disappears from the switcher (its pages are still blocked by
  // FeatureGate). The Admin panel is all-core so it never drops.
  // An item must clear BOTH gates: the feature flag (is it switched on) and the
  // capability (may this person use it).
  const isItemVisible = useCallback(
    (i: NavItem) => isPathEnabled(i.path, featureFlags) && (!i.capability || can(i.capability)),
    [featureFlags, can],
  );

  const availablePanels = useMemo(() => {
    return PANELS.filter((p) => nexusRole && p.requiredRoles.includes(nexusRole)).filter(
      (p) => p.sidebarItems.some(isItemVisible),
    );
  }, [nexusRole, isItemVisible]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as PanelId | null;
    if (saved && PANELS.some((p) => p.id === saved)) {
      // Validate the user has access to the saved panel
      const hasAccess = nexusRole && PANELS.find((p) => p.id === saved)?.requiredRoles.includes(nexusRole);
      if (hasAccess) {
        setActivePanelState(saved);
      }
    }
    setHydrated(true);
  }, [nexusRole]);

  // Auto-sync panel from URL changes
  useEffect(() => {
    if (!hydrated) return;
    const detected = detectPanelFromPath(pathname);
    if (detected && detected !== activePanel) {
      // Validate access
      const hasAccess = nexusRole && PANELS.find((p) => p.id === detected)?.requiredRoles.includes(nexusRole);
      if (hasAccess) {
        setActivePanelState(detected);
        localStorage.setItem(STORAGE_KEY, detected);
      }
    }
  }, [pathname, hydrated, nexusRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActivePanel = useCallback((panelId: PanelId) => {
    const panel = PANELS.find((p) => p.id === panelId);
    if (!panel) return;

    // Validate access
    if (nexusRole && !panel.requiredRoles.includes(nexusRole)) return;

    setActivePanelState(panelId);
    localStorage.setItem(STORAGE_KEY, panelId);
    router.push(panel.defaultPath);
  }, [nexusRole, router]);

  const currentPanel = PANELS.find((p) => p.id === activePanel) || PANELS[0];

  const value = useMemo<PanelContextValue>(() => {
    const filterItems = (items: NavItem[]) => items.filter(isItemVisible);
    // If the active panel got fully filtered out (every feature off), fall back
    // to the first still-available panel so staff are never stranded on an empty
    // sidebar.
    const resolvedPanel =
      filterItems(currentPanel.sidebarItems).length > 0
        ? currentPanel
        : availablePanels[0] || currentPanel;
    return {
      activePanel: resolvedPanel.id,
      setActivePanel,
      availablePanels,
      currentPanelTitle: resolvedPanel.title,
      currentSidebarItems: filterItems(resolvedPanel.sidebarItems),
      currentBottomNavItems: filterItems(resolvedPanel.bottomNavItems),
      currentOverflowItems: filterItems(resolvedPanel.overflowItems),
    };
  }, [activePanel, setActivePanel, availablePanels, currentPanel, isItemVisible]);

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  );
}
