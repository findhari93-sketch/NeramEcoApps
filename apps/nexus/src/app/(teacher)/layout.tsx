'use client';

import { Box, Container } from '@neram/ui';
import RoleGuard from '@/components/RoleGuard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

const teacherNavItems = [
  { label: 'Dashboard', path: '/teacher/dashboard', icon: <span style={{ fontSize: '1.25rem' }}>📊</span> },
  { label: 'Timetable', path: '/teacher/timetable', icon: <span style={{ fontSize: '1.25rem' }}>📅</span> },
  { label: 'Students', path: '/teacher/students', icon: <span style={{ fontSize: '1.25rem' }}>👥</span> },
  { label: 'Evaluate', path: '/teacher/evaluate', icon: <span style={{ fontSize: '1.25rem' }}>✏️</span> },
  { label: 'More', path: '/teacher/checklist', icon: <span style={{ fontSize: '1.25rem' }}>⋯</span> },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['teacher', 'admin']}>
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
          <Container maxWidth="lg">{children}</Container>
        </Box>
        <BottomNav items={teacherNavItems} />
      </Box>
    </RoleGuard>
  );
}
