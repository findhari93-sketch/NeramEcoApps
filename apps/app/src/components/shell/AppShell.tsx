'use client';

import { useState } from 'react';
import { Box, Drawer } from '@neram/ui';
import { useSidebar } from '@/contexts/SidebarContext';
import AppTopBar from './AppTopBar';
import AppSidebar from './AppSidebar';
import MobileBottomNav from './MobileBottomNav';
import PendingEnrollmentBanner from '@/components/PendingEnrollmentBanner';

const TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

interface AppShellProps {
  children: React.ReactNode;
  userName: string;
  userAvatar?: string | null;
  userEmail?: string | null;
  phoneVerified: boolean;
  onboardingCompleted: boolean;
  onSignOut: () => void;
}

export default function AppShell({
  children,
  userName,
  userAvatar,
  phoneVerified,
  onboardingCompleted,
  onSignOut,
}: AppShellProps) {
  const { sidebarWidth } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile-only TopBar */}
      <AppTopBar
        onMenuToggle={() => setMobileOpen(!mobileOpen)}
        phoneVerified={phoneVerified}
      />

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 220,
          },
        }}
      >
        <AppSidebar
          userName={userName}
          userAvatar={userAvatar}
          phoneVerified={phoneVerified}
          onSignOut={onSignOut}
          onItemClick={() => setMobileOpen(false)}
        />
      </Drawer>

      {/* Desktop Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          width: sidebarWidth,
          flexShrink: 0,
          transition: TRANSITION,
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: sidebarWidth,
            transition: TRANSITION,
            overflowX: 'hidden',
            borderRight: 'none',
          },
        }}
        open
      >
        <AppSidebar
          userName={userName}
          userAvatar={userAvatar}
          phoneVerified={phoneVerified}
          onSignOut={onSignOut}
        />
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${sidebarWidth}px)` },
          mt: { xs: '48px', sm: 0 },
          pb: { xs: '56px', sm: 0 },
          minHeight: { xs: 'calc(100vh - 48px)', sm: '100vh' },
          transition: TRANSITION,
        }}
      >
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
          {phoneVerified && onboardingCompleted && <PendingEnrollmentBanner />}
          {children}
        </Box>
      </Box>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </Box>
  );
}
