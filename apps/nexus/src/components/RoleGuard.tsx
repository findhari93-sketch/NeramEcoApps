'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'teacher' | 'student' | 'parent')[];
  redirectTo?: string;
}

/**
 * Guards routes based on the user's Nexus role.
 * Redirects unauthorized users to the appropriate route.
 */
export default function RoleGuard({
  children,
  allowedRoles,
  redirectTo,
}: RoleGuardProps) {
  const router = useRouter();
  const { user, nexusRole, loading } = useNexusAuthContext();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (nexusRole && !allowedRoles.includes(nexusRole)) {
      // Redirect to the appropriate dashboard based on role
      const target = redirectTo || getRoleDashboard(nexusRole);
      router.push(target);
    }
  }, [user, nexusRole, loading, allowedRoles, redirectTo, router]);

  if (loading) {
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
          Loading...
        </Typography>
      </Box>
    );
  }

  if (!user || !nexusRole || !allowedRoles.includes(nexusRole)) {
    return null;
  }

  return <>{children}</>;
}

function getRoleDashboard(role: string): string {
  switch (role) {
    case 'admin':
    case 'teacher':
      return '/teacher';
    case 'student':
      return '/student';
    case 'parent':
      return '/parent';
    default:
      return '/login';
  }
}
