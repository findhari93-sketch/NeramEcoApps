'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, AppBar, Toolbar, Typography, Button, Container, CircularProgress } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import { CollegeDashboardProvider, useCollegeDashboard } from './context';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, college, collegeAdmin, loading, signOut } = useCollegeDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/college-dashboard/login';

  useEffect(() => {
    if (!loading && !session && !isLoginPage) {
      router.push('/college-dashboard/login');
    }
  }, [loading, session, isLoginPage, router]);

  if (loading && !isLoginPage) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!session) {
    return null; // redirect in progress
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <SchoolIcon sx={{ color: '#16a34a' }} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1, color: 'text.primary' }}>
            {college?.name ?? 'College Dashboard'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {collegeAdmin?.name} ({collegeAdmin?.role?.replace('_', ' ')})
          </Typography>
          <Button size="small" onClick={signOut} color="inherit" sx={{ fontSize: 13 }}>
            Sign Out
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
        {children}
      </Container>
    </Box>
  );
}

export default function CollegeDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CollegeDashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </CollegeDashboardProvider>
  );
}
