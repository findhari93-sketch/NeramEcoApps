'use client';

import { useMemo } from 'react';
import { Box, Container } from '@neram/ui';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';
import { useQBAccess } from '@/hooks/useQBAccess';

const QB_PATH = '/student/question-bank';

const allStudentNavItems = [
  { label: 'Home', path: '/student/dashboard', icon: <HomeOutlinedIcon /> },
  { label: 'Timetable', path: '/student/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
  { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
  { label: 'Tests', path: '/student/tests', icon: <AssignmentOutlinedIcon /> },
  { label: 'Drawings', path: '/student/drawings', icon: <BrushOutlinedIcon /> },
  { label: 'My Issues', path: '/student/issues', icon: <BugReportOutlinedIcon /> },
  { label: 'Guide', path: '/student/guide', icon: <HelpOutlineIcon /> },
  { label: 'Profile', path: '/student/profile', icon: <PersonOutlinedIcon /> },
];

const allBottomNavItems = [
  { label: 'Home', path: '/student/dashboard', icon: <HomeOutlinedIcon /> },
  { label: 'Timetable', path: '/student/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
  { label: 'QB', path: QB_PATH, icon: <LibraryBooksOutlinedIcon /> },
  { label: 'Profile', path: '/student/profile', icon: <PersonOutlinedIcon /> },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();
  const { isQBEnabled } = useQBAccess();

  const studentNavItems = useMemo(
    () => isQBEnabled ? allStudentNavItems : allStudentNavItems.filter((i) => i.path !== QB_PATH),
    [isQBEnabled],
  );

  const bottomNavItems = useMemo(
    () => isQBEnabled ? allBottomNavItems : allBottomNavItems.filter((i) => i.path !== QB_PATH),
    [isQBEnabled],
  );

  return (
    <RoleGuard allowedRoles={['student']}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <DesktopSidebar items={studentNavItems} />

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
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
              bgcolor: (theme) => theme.palette.mode === 'light' ? '#FAFAFA' : 'background.default',
              pt: { xs: 2, md: 3 },
              pb: { xs: 10, md: 3 },
              px: { xs: 2, sm: 3, md: 4 },
            }}
          >
            <Container maxWidth="lg" disableGutters>
              {children}
            </Container>
          </Box>
          <BottomNav items={bottomNavItems} />
        </Box>
      </Box>
    </RoleGuard>
  );
}
