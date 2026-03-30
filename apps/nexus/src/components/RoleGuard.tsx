'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import NoClassroomWelcome from '@/components/NoClassroomWelcome';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'teacher' | 'student' | 'parent')[];
  redirectTo?: string;
  /** Skip onboarding check (used by the onboarding route itself) */
  skipOnboardingCheck?: boolean;
}

/**
 * Guards routes based on the user's Nexus role.
 * Redirects unauthorized users to the appropriate route.
 * For students: also checks onboarding completion status.
 */
export default function RoleGuard({
  children,
  allowedRoles,
  redirectTo,
  skipOnboardingCheck = false,
}: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, nexusRole, classrooms, loading, isOnboardingComplete, isProfileComplete } = useNexusAuthContext();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (nexusRole && !allowedRoles.includes(nexusRole)) {
      const target = redirectTo || getRoleDashboard(nexusRole);
      router.push(target);
      return;
    }

    // Onboarding gate: redirect students who haven't completed onboarding
    if (
      !skipOnboardingCheck &&
      nexusRole === 'student' &&
      classrooms.length > 0 &&
      !isOnboardingComplete &&
      !pathname.startsWith('/onboarding')
    ) {
      router.push('/onboarding');
      return;
    }

    // Profile completion gate: redirect approved students with missing profile fields
    if (
      !skipOnboardingCheck &&
      nexusRole === 'student' &&
      classrooms.length > 0 &&
      isOnboardingComplete &&
      !isProfileComplete &&
      !pathname.startsWith('/student/complete-profile')
    ) {
      router.push('/student/complete-profile');
      return;
    }
  }, [user, nexusRole, loading, allowedRoles, redirectTo, router, isOnboardingComplete, isProfileComplete, skipOnboardingCheck, classrooms, pathname]);

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

  // User is authenticated but has no classrooms — show welcome/onboarding page
  if (classrooms.length === 0) {
    return <NoClassroomWelcome />;
  }

  // Student hasn't completed onboarding — don't render content (redirect in progress)
  if (
    !skipOnboardingCheck &&
    nexusRole === 'student' &&
    !isOnboardingComplete &&
    !pathname.startsWith('/onboarding')
  ) {
    return null;
  }

  // Student hasn't completed profile — don't render content (redirect in progress)
  if (
    !skipOnboardingCheck &&
    nexusRole === 'student' &&
    isOnboardingComplete &&
    !isProfileComplete &&
    !pathname.startsWith('/student/complete-profile')
  ) {
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
