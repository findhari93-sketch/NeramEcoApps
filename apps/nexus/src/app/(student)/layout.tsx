'use client';

import { Box, Container } from '@neram/ui';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSidebarContext } from '@/components/SidebarProvider';
import { useQBAccess } from '@/hooks/useQBAccess';
import NavBadgeProvider from '@/components/NavBadgeProvider';
import DeviceRegistrationProvider from '@/components/DeviceRegistrationProvider';
import ExamReminderModal from '@/components/ExamReminderModal';
import WelcomeOrientation from '@/components/WelcomeOrientation';
import StudentZoneProvider, { useStudentZoneContext } from '@/components/StudentZoneProvider';

/**
 * Inner shell — consumes the active student zone (Classroom / Study Zone) and renders the
 * matching sidebar + bottom nav. The nav config lives in StudentZoneProvider.
 */
function StudentShell({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebarContext();
  const { currentNavGroups, currentBottomNavItems, currentOverflowItems, currentHomePath } =
    useStudentZoneContext();

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
            pt: { xs: 2, md: 3 },
            pb: { xs: 10, md: 3 },
            px: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Container maxWidth="lg" disableGutters>
            <DeviceRegistrationProvider>
              <ExamReminderModal />
              <WelcomeOrientation />
              {children}
            </DeviceRegistrationProvider>
          </Container>
        </Box>
        <BottomNav items={currentBottomNavItems} overflowItems={currentOverflowItems} />
      </Box>
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
