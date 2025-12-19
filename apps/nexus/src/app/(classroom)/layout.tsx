'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Container, useMediaQuery, useTheme } from '@neram/ui';
import { useMicrosoftAuth } from '@neram/auth';
import StudentNav from '@/components/StudentNav';

export default function ClassroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user, loading } = useMicrosoftAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
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
    <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <StudentNav />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          backgroundColor: 'background.default',
          pt: { xs: 2, md: 3 },
          pb: { xs: 8, md: 3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Container maxWidth="lg">{children}</Container>
      </Box>
    </Box>
  );
}
