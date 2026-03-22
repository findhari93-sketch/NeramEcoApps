'use client';

import { Box, Container } from '@neram/ui';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';

const parentNavItems = [
  { label: 'Dashboard', path: '/parent/dashboard', icon: <HomeOutlinedIcon /> },
  { label: 'Timetable', path: '/parent/timetable', icon: <CalendarTodayOutlinedIcon /> },
  { label: 'Library', path: '/parent/library/engagement', icon: <VideoLibraryOutlinedIcon /> },
  { label: 'Checklist', path: '/parent/checklist', icon: <ChecklistOutlinedIcon /> },
  { label: 'Tickets', path: '/parent/tickets', icon: <SupportAgentOutlinedIcon /> },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();

  return (
    <RoleGuard allowedRoles={['parent']}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <DesktopSidebar items={parentNavItems} />

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
            <Container maxWidth="md" disableGutters>
              {children}
            </Container>
          </Box>
          <BottomNav items={parentNavItems} />
        </Box>
      </Box>
    </RoleGuard>
  );
}
