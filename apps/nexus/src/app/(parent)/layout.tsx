'use client';

import { Box, Container } from '@neram/ui';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

const parentNavItems = [
  { label: 'Dashboard', path: '/parent/dashboard', icon: <span style={{ fontSize: '1.25rem' }}>🏠</span> },
  { label: 'Timetable', path: '/parent/timetable', icon: <span style={{ fontSize: '1.25rem' }}>📅</span> },
  { label: 'Tickets', path: '/parent/tickets', icon: <span style={{ fontSize: '1.25rem' }}>🎫</span> },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['parent']}>
      <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
        <TopBar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            backgroundColor: 'background.default',
            pt: { xs: 2, md: 3 },
            pb: { xs: 10, md: 3 },
            px: { xs: 2, sm: 3 },
          }}
        >
          <Container maxWidth="md">{children}</Container>
        </Box>
        <BottomNav items={parentNavItems} />
      </Box>
    </RoleGuard>
  );
}
