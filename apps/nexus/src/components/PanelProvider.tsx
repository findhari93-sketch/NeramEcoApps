'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
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
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

export type PanelId = 'teaching' | 'management' | 'admin';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
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
      { label: 'Course Plans', path: '/teacher/course-plans', icon: <PlaylistAddCheckOutlinedIcon /> },
      { label: 'Drawing Reviews', path: '/teacher/drawing-reviews', icon: <BrushOutlinedIcon /> },
      { label: 'Attendance', path: '/teacher/attendance', icon: <EventNoteOutlinedIcon /> },
      { label: 'Onboarding', path: '/teacher/onboarding-reviews', icon: <HowToRegOutlinedIcon /> },
      { label: 'Leaderboard', path: '/teacher/leaderboard', icon: <LeaderboardOutlinedIcon /> },
      { label: 'Guide', path: '/teacher/guide', icon: <HelpOutlineOutlinedIcon /> },
    ],
    bottomNavItems: [
      { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardOutlinedIcon /> },
      { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon /> },
      { label: 'Drawings', path: '/teacher/drawing-reviews', icon: <BrushOutlinedIcon /> },
      { label: 'Attendance', path: '/teacher/attendance', icon: <EventNoteOutlinedIcon /> },
    ],
    overflowItems: [
      { label: 'Onboarding', path: '/teacher/onboarding-reviews', icon: <HowToRegOutlinedIcon /> },
      { label: 'Leaderboard', path: '/teacher/leaderboard', icon: <LeaderboardOutlinedIcon /> },
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
      { label: 'Classrooms', path: '/teacher/classrooms', icon: <SchoolOutlinedIcon /> },
      { label: 'Course Plans', path: '/teacher/course-plans', icon: <PlaylistAddCheckOutlinedIcon /> },
      { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
      { label: 'City Students', path: '/teacher/students/city-wise', icon: <LocationCityOutlinedIcon /> },
      { label: 'Reviews', path: '/teacher/reviews', icon: <CampaignOutlinedIcon /> },
      { label: 'Onboarding', path: '/teacher/onboarding-reviews', icon: <HowToRegOutlinedIcon /> },
      { label: 'Modules', path: '/teacher/modules', icon: <ViewModuleOutlinedIcon /> },
      { label: 'Checklists', path: '/teacher/checklists', icon: <PlaylistAddCheckOutlinedIcon /> },
      { label: 'Documents', path: '/teacher/documents', icon: <DescriptionOutlinedIcon /> },
      { label: 'QB', path: '/teacher/question-bank', icon: <LibraryBooksOutlinedIcon /> },
      { label: 'Recall', path: '/teacher/exam-recall', icon: <HistoryEduOutlinedIcon /> },
      { label: 'Tests', path: '/teacher/tests', icon: <QuizOutlinedIcon /> },
      { label: 'Questions', path: '/teacher/questions', icon: <QuizOutlinedIcon /> },
      { label: 'Library', path: '/teacher/library/review', icon: <VideoLibraryOutlinedIcon /> },
      { label: 'Engagement', path: '/teacher/library/engagement', icon: <BarChartOutlinedIcon /> },
      { label: 'Devices', path: '/teacher/devices', icon: <DevicesOutlinedIcon /> },
      { label: 'Issues', path: '/teacher/issues', icon: <BugReportOutlinedIcon /> },
      { label: 'Guide', path: '/teacher/management-guide', icon: <HelpOutlineOutlinedIcon /> },
    ],
    bottomNavItems: [
      { label: 'Classrooms', path: '/teacher/classrooms', icon: <SchoolOutlinedIcon /> },
      { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
      { label: 'Library', path: '/teacher/library/review', icon: <VideoLibraryOutlinedIcon /> },
      { label: 'Modules', path: '/teacher/modules', icon: <ViewModuleOutlinedIcon /> },
    ],
    overflowItems: [
      { label: 'City Students', path: '/teacher/students/city-wise', icon: <LocationCityOutlinedIcon /> },
      { label: 'Reviews', path: '/teacher/reviews', icon: <CampaignOutlinedIcon /> },
      { label: 'Checklists', path: '/teacher/checklists', icon: <PlaylistAddCheckOutlinedIcon /> },
      { label: 'Engagement', path: '/teacher/library/engagement', icon: <BarChartOutlinedIcon /> },
      { label: 'Documents', path: '/teacher/documents', icon: <DescriptionOutlinedIcon /> },
      { label: 'QB', path: '/teacher/question-bank', icon: <LibraryBooksOutlinedIcon /> },
      { label: 'Recall', path: '/teacher/exam-recall', icon: <HistoryEduOutlinedIcon /> },
      { label: 'Tests', path: '/teacher/tests', icon: <QuizOutlinedIcon /> },
      { label: 'Questions', path: '/teacher/questions', icon: <QuizOutlinedIcon /> },
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
      { label: 'Review URLs', path: '/teacher/admin/review-platforms', icon: <LinkOutlinedIcon /> },
      { label: 'Settings', path: '/teacher/admin/settings', icon: <SettingsOutlinedIcon /> },
    ],
    bottomNavItems: [
      { label: 'Users', path: '/teacher/admin/users', icon: <GroupOutlinedIcon /> },
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
  if (pathname.startsWith('/teacher/onboarding-reviews')) return 'teaching';
  if (pathname.startsWith('/teacher/drawing-reviews')) return 'teaching';
  if (pathname.startsWith('/teacher/course-plans')) return 'teaching';
  if (pathname.startsWith('/teacher/admin/')) return 'admin';
  // City-wise student pages
  if (pathname.startsWith('/teacher/students/city-wise')) return 'management';
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
  const { nexusRole } = useNexusAuthContext();
  const pathname = usePathname();
  const router = useRouter();
  const [activePanel, setActivePanelState] = useState<PanelId>('teaching');
  const [hydrated, setHydrated] = useState(false);

  // Filter panels by role
  const availablePanels = useMemo(() => {
    return PANELS.filter((p) => nexusRole && p.requiredRoles.includes(nexusRole));
  }, [nexusRole]);

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

  const value = useMemo<PanelContextValue>(() => ({
    activePanel,
    setActivePanel,
    availablePanels,
    currentPanelTitle: currentPanel.title,
    currentSidebarItems: currentPanel.sidebarItems,
    currentBottomNavItems: currentPanel.bottomNavItems,
    currentOverflowItems: currentPanel.overflowItems,
  }), [activePanel, setActivePanel, availablePanels, currentPanel]);

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  );
}
