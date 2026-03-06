'use client';

import { useState } from 'react';
import { Box, Drawer, Container } from '@neram/ui';
import AppTopBar from './AppTopBar';
import AppSidebar from './AppSidebar';
import MobileBottomNav from './MobileBottomNav';
import PendingEnrollmentBanner from '@/components/PendingEnrollmentBanner';

const SIDEBAR_WIDTH = 272;

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
  userEmail,
  phoneVerified,
  onboardingCompleted,
  onSignOut,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) =>
    setAnchorEl(event.currentTarget);
  const handleProfileMenuClose = () => setAnchorEl(null);

  const handleSignOut = () => {
    handleProfileMenuClose();
    onSignOut();
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Top Bar */}
      <AppTopBar
        userName={userName}
        userAvatar={userAvatar}
        phoneVerified={phoneVerified}
        onMenuToggle={handleDrawerToggle}
        mobileOpen={mobileOpen}
        anchorEl={anchorEl}
        onProfileMenuOpen={handleProfileMenuOpen}
        onProfileMenuClose={handleProfileMenuClose}
        onSignOut={handleSignOut}
      />

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: SIDEBAR_WIDTH,
            mt: '56px',
            height: 'calc(100% - 56px)',
          },
        }}
      >
        <AppSidebar
          userName={userName}
          userAvatar={userAvatar}
          userEmail={userEmail}
          onItemClick={() => setMobileOpen(false)}
        />
      </Drawer>

      {/* Desktop Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: SIDEBAR_WIDTH,
            mt: '56px',
            height: 'calc(100% - 56px)',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
        open
      >
        <AppSidebar
          userName={userName}
          userAvatar={userAvatar}
          userEmail={userEmail}
        />
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${SIDEBAR_WIDTH}px)` },
          mt: '56px',
          pb: { xs: '56px', sm: 0 }, // Space for mobile bottom nav
          minHeight: 'calc(100vh - 56px)',
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
          {phoneVerified && onboardingCompleted && <PendingEnrollmentBanner />}
          {children}
        </Container>
      </Box>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </Box>
  );
}
