'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Box, Drawer } from '@neram/ui';
import { useSidebar } from '@/contexts/SidebarContext';
import AppTopBar, { TOP_BAR_HEIGHT } from './AppTopBar';
import AppSidebar from './AppSidebar';
import MobileBottomNav, { BOTTOM_NAV_HEIGHT } from './MobileBottomNav';
import ToolContextBar from './ToolContextBar';
import PendingEnrollmentBanner from '@/components/PendingEnrollmentBanner';
import { findToolByPath } from '@/lib/navigation-data';
import { recordToolVisit } from '@/lib/recent-tools';
import type { AccountTier } from '@neram/database';

const TRANSITION = 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), margin 0.25s cubic-bezier(0.4, 0, 0.2, 1)';

interface AppShellProps {
  children: React.ReactNode;
  userName: string;
  userAvatar?: string | null;
  userEmail?: string | null;
  phoneVerified: boolean;
  onboardingCompleted: boolean;
  onSignOut: () => void;
  accountTier: AccountTier;
}

/**
 * Phone and small tablet (below md): top bar, content, bottom tab bar.
 * Laptop and up (md+): collapsible sidebar, content centred to 1280px.
 *
 * Fixed bars inside pages (sticky results, action bars, FABs) read
 * --app-bottom-inset and --app-left-inset so they sit above the tab bar and
 * beside the sidebar instead of under them.
 */
export default function AppShell({
  children,
  userName,
  userAvatar,
  phoneVerified,
  onboardingCompleted,
  onSignOut,
  accountTier,
}: AppShellProps) {
  const { sidebarWidth } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const currentTool = findToolByPath(pathname);

  // Close the drawer when the route changes (back gesture, in-page links).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (currentTool && !currentTool.comingSoon) recordToolVisit(currentTool.id);
  }, [currentTool]);

  const bottomInset = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100dvh',
        bgcolor: 'background.default',
        '--app-bottom-inset': { xs: bottomInset, md: '0px' },
        '--app-left-inset': { xs: '0px', md: `${sidebarWidth}px` },
      }}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Phone top bar */}
      <AppTopBar onMenuToggle={() => setMobileOpen(true)} phoneVerified={phoneVerified} />

      {/* Phone drawer: the full sidebar, opened from the top bar menu */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 'min(304px, 86vw)' },
        }}
      >
        <AppSidebar
          userName={userName}
          userAvatar={userAvatar}
          phoneVerified={phoneVerified}
          onSignOut={onSignOut}
          accountTier={accountTier}
          onItemClick={() => setMobileOpen(false)}
          forceExpanded
        />
      </Drawer>

      {/* Laptop sidebar */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: sidebarWidth,
          flexShrink: 0,
          transition: TRANSITION,
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: sidebarWidth,
            transition: TRANSITION,
            overflowX: 'hidden',
          },
        }}
      >
        <AppSidebar
          userName={userName}
          userAvatar={userAvatar}
          phoneVerified={phoneVerified}
          onSignOut={onSignOut}
          accountTier={accountTier}
        />
      </Drawer>

      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: { md: `calc(100% - ${sidebarWidth}px)` },
          mt: { xs: `${TOP_BAR_HEIGHT}px`, md: 0 },
          pb: { xs: 'var(--app-bottom-inset)', md: 0 },
          transition: TRANSITION,
          overflowX: 'hidden',
          outline: 'none',
        }}
      >
        <Box
          sx={{
            px: { xs: 2, sm: 3, lg: 4 },
            pt: { xs: 2, sm: 3 },
            pb: { xs: 3, md: 5 },
            maxWidth: 1280,
            mx: 'auto',
          }}
        >
          {phoneVerified && onboardingCompleted && <PendingEnrollmentBanner />}
          {currentTool && <ToolContextBar tool={currentTool} pathname={pathname} />}
          {children}
        </Box>
      </Box>

      <MobileBottomNav />
    </Box>
  );
}
