'use client';

import { useEffect } from 'react';
import { Box, Container } from '@neram/ui';
import { usePathname } from 'next/navigation';
import { isFullBleedRoute, isChromelessRoute } from '@/lib/full-bleed-routes';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';
import { useQBAccess } from '@/hooks/useQBAccess';
import NavBadgeProvider from '@/components/NavBadgeProvider';
import DeviceRegistrationProvider from '@/components/DeviceRegistrationProvider';
import WelcomeOrientation from '@/components/WelcomeOrientation';
import StudentZoneProvider, { useStudentZoneContext } from '@/components/StudentZoneProvider';
import FeatureGate from '@/components/FeatureGate';
import ReportIssueFab from '@/components/ReportIssueFab';
import { installErrorCapture } from '@/lib/error-buffer';

/**
 * Inner shell — consumes the active student zone (Classroom / Study Zone) and renders the
 * matching sidebar + bottom nav. The nav config lives in StudentZoneProvider.
 */
function StudentShell({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();
  const { currentNavGroups, currentBottomNavItems, currentOverflowGroups, currentHomePath } =
    useStudentZoneContext();
  const pathname = usePathname();
  const fullBleed = isFullBleedRoute(pathname);
  const chromeless = isChromelessRoute(pathname);

  // Start passively capturing console/network errors so a later "Report a
  // problem" ticket can include what actually went wrong (staff-only).
  useEffect(() => {
    installErrorCapture();
  }, []);

  // Focus Mode renders bare. A nested layout could not do this: layouts compose
  // in Next.js, so a child cannot remove chrome a parent added. Still inside
  // RoleGuard, still feature-gated; only the navigation is gone.
  if (chromeless) {
    return (
      <DeviceRegistrationProvider>
        <FeatureGate surface="student">{children}</FeatureGate>
      </DeviceRegistrationProvider>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <DesktopSidebar groups={currentNavGroups} homePath={currentHomePath} />

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
            bgcolor: (theme) => (theme.palette.mode === 'light' ? '#FAFAFA' : 'background.default'),
            pt: fullBleed ? 0 : { xs: 2, md: 3 },
            pb: fullBleed ? { xs: 8, md: 0 } : { xs: 10, md: 3 },
            px: fullBleed ? 0 : { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Container maxWidth={fullBleed ? false : 'lg'} disableGutters>
            <DeviceRegistrationProvider>
              <WelcomeOrientation />
              <FeatureGate surface="student">{children}</FeatureGate>
            </DeviceRegistrationProvider>
          </Container>
        </Box>
        <BottomNav items={currentBottomNavItems} overflowGroups={currentOverflowGroups} />
      </Box>
      <ReportIssueFab />
    </Box>
  );
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { isQBEnabled } = useQBAccess();

  return (
    <RoleGuard allowedRoles={['student']}>
      <NavBadgeProvider>
        <StudentZoneProvider isQBEnabled={isQBEnabled ?? false}>
          <StudentShell>{children}</StudentShell>
        </StudentZoneProvider>
      </NavBadgeProvider>
    </RoleGuard>
  );
}
