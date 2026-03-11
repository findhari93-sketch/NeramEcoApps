'use client';

import { Box, Container } from '@neram/ui';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

const studentNavItems = [
  { label: 'Home', path: '/student/dashboard', icon: <HomeOutlinedIcon /> },
  { label: 'Timetable', path: '/student/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Checklist', path: '/student/checklist', icon: <ChecklistOutlinedIcon /> },
  { label: 'Drawings', path: '/student/drawings', icon: <BrushOutlinedIcon /> },
  { label: 'More', path: '/student/profile', icon: <MoreHorizIcon /> },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['student']}>
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
        <BottomNav items={studentNavItems} />
      </Box>
    </RoleGuard>
  );
}
