'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Root page — redirects authenticated users to their role-appropriate dashboard.
 * Unauthenticated users go to /login.
 */
export default function RootRedirect() {
  const router = useRouter();
  const { user, nexusRole, loading } = useNexusAuthContext();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    switch (nexusRole) {
      case 'admin':
      case 'teacher':
        router.replace('/teacher/dashboard');
        break;
      case 'parent':
        router.replace('/parent/dashboard');
        break;
      case 'student':
      default:
        router.replace('/student/dashboard');
        break;
    }
  }, [user, nexusRole, loading, router]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <CircularProgress size={40} />
      <Typography variant="body2" color="text.secondary">
        Loading your classroom...
      </Typography>
    </Box>
  );
}
