'use client';

import { Box, Container } from '@neram/ui';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

const parentNavItems = [
  { label: 'Dashboard', path: '/parent/dashboard', icon: <HomeOutlinedIcon /> },
  { label: 'Timetable', path: '/parent/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Tickets', path: '/parent/tickets', icon: <SupportAgentOutlinedIcon /> },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['parent']}>
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
          <Container maxWidth="md" disableGutters sx={{ px: { sm: 1 } }}>{children}</Container>
        </Box>
        <BottomNav items={parentNavItems} />
      </Box>
    </RoleGuard>
  );
}
