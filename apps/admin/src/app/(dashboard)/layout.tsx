'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, IconButton, Typography, AppBar, Toolbar } from '@neram/ui';
import MenuIcon from '@mui/icons-material/Menu';
import { useMicrosoftAuth } from '@neram/auth';
import Sidebar from '@/components/Sidebar';
import NotificationBell from '@/components/NotificationBell';
import { AdminProfileProvider } from '@/contexts/AdminProfileContext';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';

function MobileTopBar() {
  const { setMobileOpen } = useSidebar();
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 48, px: 1.5 }}>
        <IconButton
          edge="start"
          onClick={() => setMobileOpen(true)}
          sx={{ mr: 1 }}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant="body2" fontWeight={700} sx={{ flexGrow: 1, fontSize: 14 }}>
          Neram Classes
        </Typography>
        <NotificationBell />
      </Toolbar>
    </AppBar>
  );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useMicrosoftAuth();
  const { sidebarWidth, isMobile } = useSidebar();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Loading...
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          width: isMobile ? '100%' : `calc(100% - ${sidebarWidth}px)`,
          bgcolor: 'background.default',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        {isMobile && <MobileTopBar />}
        <Box sx={{ p: { xs: 1.5, md: 3 }, flex: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProfileProvider>
      <SidebarProvider>
        <DashboardContent>{children}</DashboardContent>
      </SidebarProvider>
    </AdminProfileProvider>
  );
}
