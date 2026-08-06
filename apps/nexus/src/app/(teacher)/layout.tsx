'use client';

import { Box, Container } from '@neram/ui';
import { usePathname } from 'next/navigation';
import { isFullBleedRoute } from '@/lib/full-bleed-routes';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';
import PanelProvider, { usePanelContext } from '@/components/PanelProvider';
import NavBadgeProvider from '@/components/NavBadgeProvider';
import StudentStageFactsProvider from '@/components/students/StudentStageFactsProvider';
import FeatureGate from '@/components/FeatureGate';

function TeacherLayoutInner({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();
  const { currentSidebarItems, currentBottomNavItems, currentOverflowGroups } = usePanelContext();
  const fullBleed = isFullBleedRoute(usePathname());

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <DesktopSidebar items={currentSidebarItems} />

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
            overflowX: 'hidden',
            overflowY: 'auto',
            bgcolor: (theme) => theme.palette.mode === 'light' ? '#FAFAFA' : 'background.default',
            pt: fullBleed ? 0 : { xs: 2, md: 3 },
            pb: fullBleed ? { xs: 8, md: 0 } : { xs: 10, md: 3 },
            px: fullBleed ? 0 : { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Container maxWidth={fullBleed ? false : 'lg'} disableGutters>
            <FeatureGate surface="staff">{children}</FeatureGate>
          </Container>
        </Box>
        <BottomNav items={currentBottomNavItems} overflowGroups={currentOverflowGroups} />
      </Box>
    </Box>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['teacher', 'admin']}>
      <PanelProvider>
        <NavBadgeProvider>
          {/* Staff only, and only here. Every student avatar under this layout can
              wear its cohort ring; the student layout never mounts this, so the
              same components render plain faces there. */}
          <StudentStageFactsProvider>
            <TeacherLayoutInner>{children}</TeacherLayoutInner>
          </StudentStageFactsProvider>
        </NavBadgeProvider>
      </PanelProvider>
    </RoleGuard>
  );
}
