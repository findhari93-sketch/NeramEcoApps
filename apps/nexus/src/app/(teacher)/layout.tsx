'use client';

import { Box, Container } from '@neram/ui';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar, { SIDEBAR_WIDTH } from '@/components/DesktopSidebar';

const teacherNavItems = [
  { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardOutlinedIcon /> },
  { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
  { label: 'Evaluate', path: '/teacher/evaluate', icon: <RateReviewOutlinedIcon /> },
  { label: 'Attendance', path: '/teacher/attendance', icon: <EventNoteOutlinedIcon /> },
  { label: 'Checklist', path: '/teacher/checklist', icon: <ChecklistOutlinedIcon /> },
  { label: 'Tests', path: '/teacher/tests', icon: <QuizOutlinedIcon /> },
];

const bottomNavItems = [
  { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardOutlinedIcon /> },
  { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
  { label: 'Evaluate', path: '/teacher/evaluate', icon: <RateReviewOutlinedIcon /> },
  { label: 'More', path: '/teacher/checklist', icon: <ChecklistOutlinedIcon /> },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['teacher', 'admin']}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* Desktop Sidebar */}
        <DesktopSidebar items={teacherNavItems} />

        {/* Main content area */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: '100vh',
            ml: { md: `${SIDEBAR_WIDTH}px` },
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
