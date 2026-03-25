'use client';

import { Box, Container } from '@neram/ui';
import RoleGuard from '@/components/RoleGuard';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['student']} skipOnboardingCheck>
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: (theme) =>
            theme.palette.mode === 'light'
              ? 'linear-gradient(135deg, #F8FAFF 0%, #EEF2FF 100%)'
              : 'background.default',
          background: (theme) =>
            theme.palette.mode === 'light'
              ? 'linear-gradient(135deg, #F8FAFF 0%, #EEF2FF 100%)'
              : undefined,
        }}
      >
        <Container
          maxWidth="sm"
          sx={{
            py: { xs: 3, sm: 4 },
            px: { xs: 2, sm: 3 },
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Container>
      </Box>
    </RoleGuard>
  );
}
