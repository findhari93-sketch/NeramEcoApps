'use client';

import { Box, Container } from '@neram/ui';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';
import PanelProvider, { usePanelContext } from '@/components/PanelProvider';

function TeacherLayoutInner({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();
  const { currentSidebarItems, currentBottomNavItems } = usePanelContext();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <DesktopSidebar items={currentSidebarItems} />

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
        <BottomNav items={currentBottomNavItems} />
      </Box>
    </Box>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['teacher', 'admin']}>
      <PanelProvider>
        <TeacherLayoutInner>{children}</TeacherLayoutInner>
      </PanelProvider>
    </RoleGuard>
  );
}
