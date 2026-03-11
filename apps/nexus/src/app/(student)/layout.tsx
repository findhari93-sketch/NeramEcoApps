'use client';

import { Box, Container } from '@neram/ui';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

const studentNavItems = [
  { label: 'Home', path: '/student/dashboard', icon: <span style={{ fontSize: '1.25rem' }}>🏠</span> },
  { label: 'Timetable', path: '/student/timetable', icon: <span style={{ fontSize: '1.25rem' }}>📅</span> },
  { label: 'Checklist', path: '/student/checklist', icon: <span style={{ fontSize: '1.25rem' }}>✅</span> },
  { label: 'Drawings', path: '/student/drawings', icon: <span style={{ fontSize: '1.25rem' }}>🎨</span> },
  { label: 'More', path: '/student/profile', icon: <span style={{ fontSize: '1.25rem' }}>⋯</span> },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['student']}>
      <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
        <TopBar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            backgroundColor: 'background.default',
            pt: { xs: 2, md: 3 },
            pb: { xs: 10, md: 3 }, // Extra bottom padding for bottom nav on mobile
            px: { xs: 2, sm: 3 },
          }}
        >
          <Container maxWidth="lg">{children}</Container>
        </Box>
        <BottomNav items={studentNavItems} />
      </Box>
    </RoleGuard>
  );
}
