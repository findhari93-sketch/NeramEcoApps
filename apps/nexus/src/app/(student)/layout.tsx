'use client';

import { useMemo } from 'react';
import { Box, Container } from '@neram/ui';
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
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';
import { useQBAccess } from '@/hooks/useQBAccess';
import NavBadgeProvider from '@/components/NavBadgeProvider';
import DeviceRegistrationProvider from '@/components/DeviceRegistrationProvider';

const QB_PATH = '/student/question-bank';

// Sidebar: grouped into collapsible categories (Profile & Guide moved to TopBar dropdown)
const allStudentNavGroups = [
  {
    label: 'Live Class',
    items: [
      { label: 'Timetable', path: '/student/timetable', icon: <CalendarTodayOutlinedIcon /> },
    ],
  },
  {
    label: 'Learn',
    items: [
      { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
      { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
      { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
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
      { label: 'My Issues', path: '/student/issues', icon: <BugReportOutlinedIcon /> },
    ],
  },
];

// Mobile bottom nav — primary items
const allBottomNavItems = [
  { label: 'Home', path: '/student/dashboard', icon: <HomeOutlinedIcon /> },
  { label: 'Timetable', path: '/student/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Library', path: '/student/library', icon: <VideoLibraryOutlinedIcon /> },
  { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
];

// Mobile bottom nav — overflow "More" items (includes Guide & Profile for mobile access)
const allOverflowItems = [
  { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
  { label: 'Tests', path: '/student/tests', icon: <AssignmentOutlinedIcon /> },
  { label: 'Drawings', path: '/student/drawings', icon: <BrushOutlinedIcon /> },
  { label: 'Recall', path: '/student/exam-recall', icon: <HistoryEduOutlinedIcon /> },
  { label: 'Documents', path: '/student/documents', icon: <DescriptionOutlinedIcon /> },
  { label: 'Reviews', path: '/student/reviews', icon: <RateReviewOutlinedIcon /> },
  { label: 'My Issues', path: '/student/issues', icon: <BugReportOutlinedIcon /> },
  { label: 'Guide', path: '/student/guide', icon: <HelpOutlineIcon /> },
  { label: 'Profile', path: '/student/profile', icon: <PersonOutlinedIcon /> },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();
  const { isQBEnabled } = useQBAccess();

  const studentNavGroups = useMemo(
    () => isQBEnabled
      ? allStudentNavGroups
      : allStudentNavGroups.map(g => ({
          ...g,
          items: g.items.filter(i => i.path !== QB_PATH),
        })).filter(g => g.items.length > 0),
    [isQBEnabled],
  );

  const bottomNavItems = useMemo(
    () => isQBEnabled ? allBottomNavItems : allBottomNavItems.filter((i) => i.path !== QB_PATH),
    [isQBEnabled],
  );

  const overflowItems = useMemo(
    () => isQBEnabled ? allOverflowItems : allOverflowItems.filter((i) => i.path !== QB_PATH),
    [isQBEnabled],
  );

  return (
    <RoleGuard allowedRoles={['student']}>
      <NavBadgeProvider>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <DesktopSidebar groups={studentNavGroups} homePath="/student/dashboard" />

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
              minHeight: '100vh',
              ml: { md: `${sidebarWidth}px` },
              transition: 'margin-left 250ms cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            <TopBar />
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                overflow: 'hidden',
                bgcolor: (theme) => theme.palette.mode === 'light' ? '#FAFAFA' : 'background.default',
                pt: { xs: 2, md: 3 },
                pb: { xs: 10, md: 3 },
                px: { xs: 2, sm: 3, md: 4 },
              }}
            >
              <Container maxWidth="lg" disableGutters>
                <DeviceRegistrationProvider>
                  {children}
                </DeviceRegistrationProvider>
              </Container>
            </Box>
            <BottomNav items={bottomNavItems} overflowItems={overflowItems} />
          </Box>
        </Box>
      </NavBadgeProvider>
    </RoleGuard>
  );
}
