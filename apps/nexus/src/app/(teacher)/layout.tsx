'use client';

import { Box, Container } from '@neram/ui';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

const teacherNavItems = [
  { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardOutlinedIcon /> },
  { label: 'Timetable', path: '/teacher/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Students', path: '/teacher/students', icon: <PeopleOutlinedIcon /> },
  { label: 'Evaluate', path: '/teacher/evaluate', icon: <RateReviewOutlinedIcon /> },
  { label: 'More', path: '/teacher/checklist', icon: <MoreHorizIcon /> },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['teacher', 'admin']}>
      <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
        <TopBar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            backgroundColor: 'background.default',
            pt: { xs: 1.5, md: 2.5 },
            pb: { xs: 8, md: 2.5 },
            px: { xs: 1.5, sm: 2.5 },
          }}
        >
          <Container maxWidth="lg" disableGutters sx={{ px: { sm: 1 } }}>{children}</Container>
        </Box>
        <BottomNav items={teacherNavItems} />
      </Box>
    </RoleGuard>
  );
}
