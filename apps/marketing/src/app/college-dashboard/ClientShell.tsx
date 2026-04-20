'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, AppBar, Toolbar, Typography, Button, Container, CircularProgress } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import HandshakeIcon from '@mui/icons-material/Handshake';
import Link from 'next/link';
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

  const NAV_LINKS = [
    { href: '/college-dashboard', label: 'Overview', icon: <DashboardIcon sx={{ fontSize: 18 }} /> },
    { href: '/college-dashboard/leads', label: 'Leads', icon: <PeopleIcon sx={{ fontSize: 18 }} /> },
    { href: '/college-dashboard/analytics', label: 'Analytics', icon: <BarChartIcon sx={{ fontSize: 18 }} /> },
    { href: '/college-dashboard/partnership', label: 'Partnership', icon: <HandshakeIcon sx={{ fontSize: 18 }} /> },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', minHeight: { xs: 'auto', sm: 64 }, py: { xs: 1, sm: 0 } }}>
          <SchoolIcon sx={{ color: '#16a34a' }} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary', mr: 'auto' }}>
            {college?.name ?? 'College Dashboard'}
          </Typography>
          {/* Nav links */}
          <Box sx={{ display: 'flex', gap: 0.5, order: { xs: 3, sm: 0 }, width: { xs: '100%', sm: 'auto' }, pb: { xs: 0.5, sm: 0 } }}>
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || (link.href !== '/college-dashboard' && pathname.startsWith(link.href));
              return (
                <Button
                  key={link.href}
                  component={Link}
                  href={link.href}
                  size="small"
                  startIcon={link.icon}
                  sx={{
                    fontSize: 13,
                    textTransform: 'none',
                    fontWeight: active ? 700 : 500,
                    color: active ? 'primary.main' : 'text.secondary',
                    bgcolor: active ? 'primary.50' : 'transparent',
                    '&:hover': { bgcolor: 'grey.100' },
                    px: 1.5,
                    borderRadius: 1.5,
                  }}
                >
                  {link.label}
                </Button>
              );
            })}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {collegeAdmin?.name}
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

export default function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <CollegeDashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </CollegeDashboardProvider>
  );
}
