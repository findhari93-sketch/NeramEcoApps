'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Alert, Box, Button, Paper, Skeleton, Typography } from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import Link from 'next/link';
import { CollegeDashboardProvider, useCollegeDashboard } from './context';
import { formatDay } from './ui';

const PUBLIC_PAGES = ['/college-dashboard/login', '/college-dashboard/welcome'];

const NAV = [
  { href: '/college-dashboard', label: 'Overview', Icon: DashboardOutlinedIcon },
  { href: '/college-dashboard/profile', label: 'College page', Icon: EditNoteOutlinedIcon },
  { href: '/college-dashboard/leads', label: 'Enquiries', Icon: ForumOutlinedIcon },
  { href: '/college-dashboard/reviews', label: 'Reviews', Icon: RateReviewOutlinedIcon },
  { href: '/college-dashboard/analytics', label: 'Insights', Icon: InsightsOutlinedIcon },
  { href: '/college-dashboard/team', label: 'Team', Icon: GroupOutlinedIcon },
  { href: '/college-dashboard/partnership', label: 'Partnership', Icon: HandshakeOutlinedIcon },
];

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, college, collegeAdmin, plan, accessError, loading, signOut } = useCollegeDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_PAGES.includes(pathname);

  useEffect(() => {
    if (!loading && !session && !isPublic) {
      router.push('/college-dashboard/login');
    }
  }, [loading, session, isPublic, router]);

  if (isPublic) return <>{children}</>;

  if (loading || !session) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50', p: 2 }} aria-busy="true">
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={120} sx={{ mb: 2, maxWidth: 1100, mx: 'auto' }} />
        <Skeleton variant="rounded" height={240} sx={{ maxWidth: 1100, mx: 'auto' }} />
      </Box>
    );
  }

  if (accessError) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', px: 2 }}>
        <Paper variant="outlined" sx={{ maxWidth: 440, p: 3, borderRadius: 3 }}>
          <Typography variant="h6" component="h1" fontWeight={700} gutterBottom>
            We could not open your dashboard
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {accessError} You can reach us at support@neramclasses.com.
          </Typography>
          <Button variant="outlined" onClick={signOut} sx={{ minHeight: 44 }}>
            Sign out
          </Button>
        </Paper>
      </Box>
    );
  }

  const ended = plan && plan.tier === 'free' && plan.last_ended;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50', fontFamily: (t) => t.typography.fontFamily }}>
      <Box
        component="header"
        sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ maxWidth: 1100, mx: 'auto', px: 2, minHeight: 56, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {college?.logo_url ? (
            <Box component="img" src={college.logo_url} alt="" sx={{ width: 32, height: 32, borderRadius: 1, objectFit: 'contain', bgcolor: 'common.white', border: '1px solid', borderColor: 'divider' }} />
          ) : null}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography component="p" sx={{ m: 0, fontWeight: 700, fontSize: 16, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {college?.name ?? 'College dashboard'}
            </Typography>
            <Typography component="p" sx={{ m: 0, fontSize: 12.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {collegeAdmin ? `${collegeAdmin.name}, ${collegeAdmin.role}` : 'Neram Classes'}
            </Typography>
          </Box>
          <Button
            onClick={signOut}
            color="inherit"
            startIcon={<LogoutOutlinedIcon />}
            sx={{ minHeight: 44, textTransform: 'none', color: 'text.secondary', flexShrink: 0 }}
          >
            Sign out
          </Button>
        </Box>
        <Box
          component="nav"
          aria-label="Dashboard"
          sx={{ maxWidth: 1100, mx: 'auto', px: 1, display: 'flex', gap: 0.5, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
        >
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || (href !== '/college-dashboard' && pathname.startsWith(href));
            return (
              <Box
                key={href}
                component={Link}
                href={href}
                aria-current={active ? 'page' : undefined}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  minHeight: 44,
                  px: 1.5,
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'primary.main' : 'text.secondary',
                  textDecoration: 'none',
                  borderBottom: '2px solid',
                  borderColor: active ? 'primary.main' : 'transparent',
                  '&:hover': { color: 'text.primary' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
              >
                <Icon aria-hidden sx={{ fontSize: 18 }} />
                {label}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box component="main" sx={{ maxWidth: 1100, mx: 'auto', px: 2, py: { xs: 2, sm: 3 } }}>
        {ended && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Your {ended.tier} plan {ended.status === 'revoked' ? 'was stopped' : 'ended'} on {formatDay(ended.revoked_at ?? ended.ends_on)}. Paid features are off on
            your public page. Your team can still sign in and keep your details up to date.
          </Alert>
        )}
        {children}
      </Box>
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

